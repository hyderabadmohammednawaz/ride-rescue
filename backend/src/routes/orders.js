import express from 'express';
import mongoose from 'mongoose';
import { Order, ORDER_STATUSES } from '../models/Order.js';
import { SparePart } from '../models/SparePart.js';
import { Coupon } from '../models/Coupon.js';
import { asyncRoute, badRequest, forbidden, notFound } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { orderReference } from '../utils/ids.js';
import { notify, notifyMany } from '../services/notifications.js';
import { emitToUser } from '../realtime/hub.js';

const router = express.Router();
router.use(requireAuth);

const DELIVERY_FEE = 40;
const FREE_DELIVERY_ABOVE = 999;

/** Validates a coupon and returns the discount it grants on `amount`. */
export async function applyCoupon(code, amount, appliesTo) {
  if (!code) return { discount: 0, coupon: null };
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), active: true });
  if (!coupon) throw badRequest('Invalid coupon code');
  if (coupon.validTill && coupon.validTill < new Date()) throw badRequest('This coupon has expired');
  if (coupon.usedCount >= coupon.usageLimit) throw badRequest('This coupon has been fully redeemed');
  if (amount < coupon.minOrderValue) throw badRequest(`Coupon needs a minimum value of ₹${coupon.minOrderValue}`);
  if (coupon.appliesTo !== 'both' && coupon.appliesTo !== appliesTo) throw badRequest('This coupon does not apply here');

  const raw = coupon.discountType === 'percent' ? (amount * coupon.value) / 100 : coupon.value;
  return { discount: Math.round(Math.min(raw, coupon.maxDiscount)), coupon };
}

// POST /api/orders/quote - price a cart before checkout (coupon preview)
router.post(
  '/quote',
  requireRole('customer'),
  asyncRoute(async (req, res) => {
    const { items = [], couponCode } = req.body;
    const ids = items.map((i) => i.partId);
    const parts = await SparePart.find({ _id: { $in: ids }, active: true });
    const byId = new Map(parts.map((p) => [String(p._id), p]));

    let subtotal = 0;
    const lines = items.map((i) => {
      const part = byId.get(String(i.partId));
      if (!part) throw badRequest('One of the items is no longer available');
      const quantity = Math.max(1, Number(i.quantity) || 1);
      subtotal += part.price * quantity;
      return { name: part.name, price: part.price, quantity, lineTotal: part.price * quantity };
    });

    const { discount } = await applyCoupon(couponCode, subtotal, 'order');
    const deliveryFee = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
    res.json({ lines, subtotal, discount, deliveryFee, total: subtotal - discount + deliveryFee });
  })
);

// POST /api/orders - place an order
router.post(
  '/',
  requireRole('customer'),
  asyncRoute(async (req, res) => {
    const { items = [], deliveryAddress, couponCode } = req.body;
    if (items.length === 0) throw badRequest('Your cart is empty');
    if (!deliveryAddress) throw badRequest('A delivery address is required');

    const parts = await SparePart.find({ _id: { $in: items.map((i) => i.partId) }, active: true });
    const byId = new Map(parts.map((p) => [String(p._id), p]));

    let subtotal = 0;
    const orderItems = items.map((i) => {
      const part = byId.get(String(i.partId));
      if (!part) throw badRequest('One of the items is no longer available');
      const quantity = Math.max(1, Number(i.quantity) || 1);
      if (part.stock < quantity) throw badRequest(`Only ${part.stock} left of ${part.name}`);
      subtotal += part.price * quantity;
      return {
        part: part._id,
        vendor: part.vendor,
        name: part.name,
        sku: part.sku,
        price: part.price,
        quantity,
        warrantyMonths: part.warrantyMonths,
      };
    });

    const { discount, coupon } = await applyCoupon(couponCode, subtotal, 'order');
    const deliveryFee = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;

    const order = await Order.create({
      reference: orderReference(),
      customer: req.user._id,
      items: orderItems,
      vendors: [...new Set(orderItems.map((i) => String(i.vendor)))].map((id) => new mongoose.Types.ObjectId(id)),
      subtotal,
      discount,
      couponCode: coupon?.code,
      deliveryFee,
      total: subtotal - discount + deliveryFee,
      deliveryAddress,
      statusHistory: [{ status: 'placed', at: new Date() }],
    });

    // Reserve stock and record the sale.
    await Promise.all(
      orderItems.map((i) =>
        SparePart.updateOne({ _id: i.part }, { $inc: { stock: -i.quantity, unitsSold: i.quantity } })
      )
    );
    if (coupon) await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } });

    // Low-stock alerts for vendors.
    const restocked = await SparePart.find({ _id: { $in: orderItems.map((i) => i.part) } });
    for (const part of restocked) {
      if (part.stock <= part.lowStockThreshold) {
        await notify(part.vendor, {
          title: '⚠️ Low stock alert',
          body: `${part.name} is down to ${part.stock} unit(s)`,
          type: 'system',
          link: '/vendor/inventory',
        });
      }
    }

    await notifyMany(order.vendors, {
      title: 'New order received',
      body: `Order ${order.reference} — ₹${order.total}`,
      type: 'order',
      link: '/vendor/orders',
    });
    order.vendors.forEach((v) => emitToUser(v, 'order:new', order.toObject()));

    await notify(req.user._id, { title: 'Order placed', body: `${order.reference} — ₹${order.total}`, type: 'order', link: `/customer/orders/${order._id}` });

    res.status(201).json({ order });
  })
);

// GET /api/orders - role-aware list
router.get(
  '/',
  asyncRoute(async (req, res) => {
    const filter = {};
    if (req.user.role === 'customer') filter.customer = req.user._id;
    else if (req.user.role === 'vendor') filter.vendors = req.user._id;
    else if (req.user.role !== 'admin') throw forbidden('Not available for this role');
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit || 60))
      .populate('customer', 'name phone')
      .populate('items.part', 'image category');

    // A vendor only sees their own lines of a shared order.
    if (req.user.role === 'vendor') {
      const scoped = orders.map((o) => {
        const obj = o.toObject();
        obj.items = obj.items.filter((i) => String(i.vendor) === String(req.user._id));
        obj.vendorSubtotal = obj.items.reduce((s, i) => s + i.price * i.quantity, 0);
        return obj;
      });
      return res.json({ orders: scoped });
    }
    return res.json({ orders });
  })
);

// GET /api/orders/:id
router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name phone')
      .populate('items.part', 'image category warrantyMonths')
      .populate('items.vendor', 'name vendorProfile.shopName');
    if (!order) throw notFound('Order not found');

    const allowed =
      String(order.customer._id) === String(req.user._id) ||
      order.vendors.some((v) => String(v) === String(req.user._id)) ||
      req.user.role === 'admin';
    if (!allowed) throw forbidden('This is not your order');

    res.json({ order });
  })
);

// PATCH /api/orders/:id/status - vendor accepts / dispatches / delivers
router.patch(
  '/:id/status',
  requireRole('vendor', 'admin'),
  asyncRoute(async (req, res) => {
    const { status, note } = req.body;
    if (!ORDER_STATUSES.includes(status)) throw badRequest('Unknown status');

    const order = await Order.findById(req.params.id);
    if (!order) throw notFound('Order not found');
    if (req.user.role === 'vendor' && !order.vendors.some((v) => String(v) === String(req.user._id))) {
      throw forbidden('This order does not include your products');
    }

    const flow = { placed: ['accepted', 'cancelled'], accepted: ['dispatched', 'cancelled'], dispatched: ['delivered'] };
    if (!flow[order.status]?.includes(status)) throw badRequest(`Cannot move a ${order.status} order to ${status}`);

    order.status = status;
    order.statusHistory.push({ status, at: new Date(), note });
    if (note) order.trackingNote = note;
    if (status === 'delivered') order.deliveredAt = new Date();

    // Restock if cancelled before dispatch.
    if (status === 'cancelled') {
      await Promise.all(
        order.items.map((i) => SparePart.updateOne({ _id: i.part }, { $inc: { stock: i.quantity, unitsSold: -i.quantity } }))
      );
    }
    await order.save();

    const titles = { accepted: 'Order accepted', dispatched: 'Order dispatched', delivered: 'Order delivered', cancelled: 'Order cancelled' };
    await notify(order.customer, {
      title: titles[status],
      body: `${order.reference}${note ? ` — ${note}` : ''}`,
      type: 'order',
      link: `/customer/orders/${order._id}`,
    });
    emitToUser(order.customer, 'order:updated', order.toObject());

    res.json({ order });
  })
);

export default router;
