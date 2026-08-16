import express from 'express';
import crypto from 'node:crypto';
import { Payment } from '../models/Payment.js';
import { Booking } from '../models/Booking.js';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { asyncRoute, badRequest, forbidden, notFound } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { paymentReference } from '../utils/ids.js';
import { notify } from '../services/notifications.js';
import { emitToUser } from '../realtime/hub.js';

const router = express.Router();
router.use(requireAuth);

const gatewayLive = () => Boolean(env.razorpayKeyId && env.razorpayKeySecret);

/**
 * Creates a payment order. With Razorpay keys configured this is where the
 * Razorpay order would be created; without them we mint a mock order id so the
 * whole checkout flow is demonstrable offline.
 */
router.post(
  '/create',
  requireRole('customer'),
  asyncRoute(async (req, res) => {
    const { purpose, bookingId, orderId, method = 'upi' } = req.body;
    if (!['booking', 'order', 'wallet_topup'].includes(purpose)) throw badRequest('Unknown payment purpose');
    if (!['upi', 'card', 'wallet', 'cash'].includes(method)) throw badRequest('Unknown payment method');

    let amount;
    let booking = null;
    let order = null;

    if (purpose === 'booking') {
      booking = await Booking.findById(bookingId);
      if (!booking) throw notFound('Booking not found');
      if (String(booking.customer) !== String(req.user._id)) throw forbidden('This is not your booking');
      if (booking.paymentStatus === 'paid') throw badRequest('This booking is already paid');
      if (booking.status !== 'completed') throw badRequest('Payment opens once the service is completed');
      amount = booking.charges.total;
    } else if (purpose === 'order') {
      order = await Order.findById(orderId);
      if (!order) throw notFound('Order not found');
      if (String(order.customer) !== String(req.user._id)) throw forbidden('This is not your order');
      if (order.paymentStatus === 'paid') throw badRequest('This order is already paid');
      amount = order.total;
    } else {
      amount = Number(req.body.amount);
      if (!amount || amount < 1) throw badRequest('Enter a top-up amount');
    }

    if (method === 'wallet' && req.user.walletBalance < amount) {
      throw badRequest(`Wallet balance is ₹${req.user.walletBalance}, which is short by ₹${amount - req.user.walletBalance}`);
    }

    const payment = await Payment.create({
      reference: paymentReference(),
      customer: req.user._id,
      amount,
      method,
      purpose,
      booking: booking?._id,
      order: order?._id,
      gateway: gatewayLive() ? 'razorpay' : 'mock',
      status: 'pending',
    });

    res.status(201).json({
      payment,
      gateway: payment.gateway,
      // The frontend passes these to the Razorpay checkout widget when live.
      checkout: {
        key: env.razorpayKeyId || 'rzp_test_mock',
        amountPaise: Math.round(amount * 100),
        currency: 'INR',
        orderId: gatewayLive() ? null : `order_mock_${payment.reference}`,
        name: 'RideRescue',
        description: purpose === 'booking' ? `Service ${booking?.reference}` : purpose === 'order' ? `Order ${order?.reference}` : 'Wallet top-up',
        prefill: { name: req.user.name, email: req.user.email, contact: req.user.phone },
      },
    });
  })
);

// POST /api/payments/:id/confirm - called after the gateway (or mock) succeeds
router.post(
  '/:id/confirm',
  requireRole('customer'),
  asyncRoute(async (req, res) => {
    const payment = await Payment.findById(req.params.id);
    if (!payment) throw notFound('Payment not found');
    if (String(payment.customer) !== String(req.user._id)) throw forbidden('This is not your payment');
    if (payment.status === 'success') return res.json({ payment, message: 'Already paid' });

    // With live keys, verify Razorpay's HMAC signature before trusting the client.
    if (payment.gateway === 'razorpay') {
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
      const expected = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');
      if (expected !== razorpaySignature) {
        payment.status = 'failed';
        await payment.save();
        throw badRequest('Payment signature verification failed');
      }
      payment.gatewayPaymentId = razorpayPaymentId;
    } else {
      payment.gatewayPaymentId = `mock_${payment.reference}`;
    }

    if (payment.method === 'wallet') {
      const customer = await User.findById(payment.customer);
      if (customer.walletBalance < payment.amount) throw badRequest('Insufficient wallet balance');
      customer.walletBalance -= payment.amount;
      await customer.save();
    }

    payment.status = 'success';
    payment.paidAt = new Date();
    await payment.save();

    if (payment.purpose === 'booking') {
      const booking = await Booking.findById(payment.booking);
      booking.paymentStatus = 'paid';
      booking.payment = payment._id;
      await booking.save();
      if (booking.mechanic) {
        await notify(booking.mechanic, {
          title: 'Payment received',
          body: `₹${payment.amount} for ${booking.reference}`,
          type: 'payment',
          link: `/mechanic/jobs/${booking._id}`,
        });
        emitToUser(booking.mechanic, 'booking:paid', { bookingId: booking._id, amount: payment.amount });
      }
    } else if (payment.purpose === 'order') {
      const order = await Order.findById(payment.order);
      order.paymentStatus = 'paid';
      order.payment = payment._id;
      await order.save();
    } else if (payment.purpose === 'wallet_topup') {
      await User.findByIdAndUpdate(payment.customer, { $inc: { walletBalance: payment.amount } });
    }

    await notify(payment.customer, {
      title: 'Payment successful',
      body: `₹${payment.amount} paid via ${payment.method.toUpperCase()}`,
      type: 'payment',
    });

    res.json({ payment, message: 'Payment successful' });
  })
);

// GET /api/payments - the signed-in customer's payment history
router.get(
  '/',
  asyncRoute(async (req, res) => {
    const filter = req.user.role === 'admin' ? {} : { customer: req.user._id };
    const payments = await Payment.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit || 50))
      .populate('booking', 'reference')
      .populate('order', 'reference');
    res.json({ payments });
  })
);

// GET /api/payments/invoice/:bookingId - invoice data for the PDF generator
router.get(
  '/invoice/:bookingId',
  asyncRoute(async (req, res) => {
    const booking = await Booking.findById(req.params.bookingId)
      .populate('customer', 'name email phone')
      .populate('mechanic', 'name phone')
      .populate('serviceType', 'name')
      .populate('payment');
    if (!booking) throw notFound('Booking not found');

    const isOwner = String(booking.customer._id) === String(req.user._id);
    const isMechanic = String(booking.mechanic?._id || '') === String(req.user._id);
    if (!isOwner && !isMechanic && req.user.role !== 'admin') throw forbidden('This is not your booking');

    res.json({
      invoice: {
        number: `INV-${booking.reference}`,
        issuedOn: booking.completedAt || booking.updatedAt,
        billedTo: booking.customer,
        servicedBy: booking.mechanic,
        vehicle: booking.vehicle,
        service: booking.serviceType?.name,
        lines: [
          { label: 'Labour charges', amount: booking.charges.labour },
          ...(booking.charges.visitFee ? [{ label: 'Emergency visit fee', amount: booking.charges.visitFee }] : []),
          ...booking.partsUsed.map((p) => ({ label: `${p.name} × ${p.quantity}`, amount: p.price * p.quantity })),
          ...(booking.charges.discount ? [{ label: 'Discount', amount: -booking.charges.discount }] : []),
        ],
        total: booking.charges.total,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.payment?.method,
        paidAt: booking.payment?.paidAt,
        qrToken: booking.qrToken,
      },
    });
  })
);

export default router;
