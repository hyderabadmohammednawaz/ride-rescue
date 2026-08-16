import express from 'express';
import { User } from '../models/User.js';
import { Booking } from '../models/Booking.js';
import { Order } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { SparePart } from '../models/SparePart.js';
import { Complaint } from '../models/Complaint.js';
import { Coupon } from '../models/Coupon.js';
import { asyncRoute, badRequest, notFound } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rankMechanics } from '../services/ai/mechanicMatch.js';
import { notify } from '../services/notifications.js';
import { emitToUser } from '../realtime/hub.js';
import { distanceKm, etaMinutes } from '../utils/geo.js';

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// GET /api/admin/dashboard
router.get(
  '/dashboard',
  asyncRoute(async (req, res) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const [
      customers,
      mechanics,
      activeMechanics,
      vendors,
      bookings,
      activeBookings,
      completedBookings,
      orders,
      payments,
      openComplaints,
      lowStock,
    ] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'mechanic' }),
      User.countDocuments({ role: 'mechanic', 'mechanicProfile.isAvailable': true, isBlocked: false }),
      User.countDocuments({ role: 'vendor' }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: { $in: ['pending', 'accepted', 'arrived', 'in_progress'] } }),
      Booking.find({ status: 'completed' }).select('charges completedAt kind').lean(),
      Order.find({ status: { $ne: 'cancelled' } }).select('total createdAt status').lean(),
      Payment.find({ status: 'success' }).select('amount method createdAt').lean(),
      Complaint.countDocuments({ status: { $ne: 'resolved' } }),
      SparePart.countDocuments({ active: true, $expr: { $lte: ['$stock', '$lowStockThreshold'] } }),
    ]);

    const serviceRevenue = completedBookings.reduce((s, b) => s + (b.charges?.total || 0), 0);
    const partsRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);

    // Revenue trend for the dashboard chart.
    const byDay = new Map();
    for (const p of payments) {
      if (new Date(p.createdAt) < thirtyDaysAgo) continue;
      const key = new Date(p.createdAt).toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + p.amount);
    }

    const methodSplit = payments.reduce((acc, p) => {
      acc[p.method] = (acc[p.method] || 0) + p.amount;
      return acc;
    }, {});

    res.json({
      users: { customers, mechanics, activeMechanics, vendors, total: customers + mechanics + vendors },
      bookings: {
        total: bookings,
        active: activeBookings,
        completed: completedBookings.length,
        sosCount: completedBookings.filter((b) => b.kind === 'sos').length,
      },
      revenue: {
        service: serviceRevenue,
        parts: partsRevenue,
        total: serviceRevenue + partsRevenue,
        collected: payments.reduce((s, p) => s + p.amount, 0),
        methodSplit,
        byDay: [...byDay.entries()].sort().map(([date, amount]) => ({ date, amount })),
      },
      orders: { total: orders.length, pending: orders.filter((o) => ['placed', 'accepted'].includes(o.status)).length },
      alerts: { openComplaints, lowStockProducts: lowStock },
    });
  })
);

// GET /api/admin/users
router.get(
  '/users',
  asyncRoute(async (req, res) => {
    const { role, q, blocked, limit = 100 } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (blocked === 'true') filter.isBlocked = true;
    if (q) {
      const regex = new RegExp(String(q).trim(), 'i');
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }
    const users = await User.find(filter).select('-passwordHash').sort({ createdAt: -1 }).limit(Number(limit));
    res.json({ users });
  })
);

// PATCH /api/admin/users/:id - block, unblock, verify documents
router.patch(
  '/users/:id',
  asyncRoute(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw notFound('User not found');
    if (user.role === 'admin' && String(user._id) !== String(req.user._id)) {
      throw badRequest('Admin accounts cannot be modified from here');
    }

    if (req.body.isBlocked !== undefined) {
      user.isBlocked = Boolean(req.body.isBlocked);
      await notify(user._id, {
        title: user.isBlocked ? 'Account blocked' : 'Account restored',
        body: user.isBlocked ? req.body.reason || 'Contact support for details.' : 'You can use RideRescue again.',
        type: 'system',
      });
    }
    if (req.body.documentsVerified !== undefined && user.role === 'mechanic') {
      user.mechanicProfile.documentsVerified = Boolean(req.body.documentsVerified);
      if (user.mechanicProfile.documentsVerified) {
        await notify(user._id, { title: '✅ Documents verified', body: 'You can now receive jobs.', type: 'system' });
      }
    }
    if (req.body.isVerified !== undefined) user.isVerified = Boolean(req.body.isVerified);

    await user.save();
    res.json({ user: user.toSafeJSON() });
  })
);

// GET /api/admin/bookings
router.get(
  '/bookings',
  asyncRoute(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
    if (req.query.kind) filter.kind = req.query.kind;

    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit || 100))
      .populate('customer', 'name phone')
      .populate('mechanic', 'name phone')
      .populate('serviceType', 'name icon');
    res.json({ bookings });
  })
);

// POST /api/admin/bookings/:id/assign - manual mechanic assignment
router.post(
  '/bookings/:id/assign',
  asyncRoute(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw notFound('Booking not found');
    if (['completed', 'cancelled'].includes(booking.status)) throw badRequest('This booking is closed');

    const mechanic = await User.findOne({ _id: req.body.mechanicId, role: 'mechanic' });
    if (!mechanic) throw notFound('Mechanic not found');

    const km = distanceKm(mechanic.location.coordinates, booking.pickupLocation.coordinates);
    booking.mechanic = mechanic._id;
    booking.distanceKm = Number(km.toFixed(2));
    booking.etaMinutes = etaMinutes(km);
    booking.mechanicLocation = { type: 'Point', coordinates: mechanic.location.coordinates, updatedAt: new Date() };
    booking.status = 'accepted';
    booking.statusHistory.push({ status: 'accepted', at: new Date(), note: `Assigned by admin ${req.user.name}` });
    await booking.save();

    const saved = await Booking.findById(booking._id)
      .populate('customer', 'name phone avatarColor')
      .populate('mechanic', 'name phone avatarColor mechanicProfile')
      .populate('serviceType', 'name icon');

    await notify(mechanic._id, { title: 'Job assigned by admin', body: `${saved.customer.name} — ${booking.distanceKm} km away`, type: 'booking', link: `/mechanic/jobs/${booking._id}` });
    await notify(booking.customer, { title: 'Mechanic assigned', body: `${mechanic.name} — ETA ${booking.etaMinutes} min`, type: 'booking', link: `/customer/bookings/${booking._id}` });
    emitToUser(mechanic._id, 'booking:assigned', saved);
    emitToUser(booking.customer, 'booking:updated', saved);

    res.json({ booking: saved });
  })
);

// GET /api/admin/bookings/:id/candidates - AI ranking, for manual assignment
router.get(
  '/bookings/:id/candidates',
  asyncRoute(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw notFound('Booking not found');
    const { ranked } = await rankMechanics(booking.pickupLocation.coordinates, {
      isEmergency: booking.kind === 'sos',
      radiusKm: 30,
      limit: 8,
    });
    res.json({
      candidates: ranked.map((r) => ({
        _id: r.mechanic._id,
        name: r.mechanic.name,
        phone: r.mechanic.phone,
        rating: r.mechanic.mechanicProfile?.ratingAverage || 0,
        experienceYears: r.mechanic.mechanicProfile?.experienceYears || 0,
        distanceKm: r.distanceKm,
        etaMinutes: r.etaMinutes,
        activeJobs: r.activeJobs,
        matchScore: r.score,
        reasons: r.reasons,
      })),
    });
  })
);

// GET /api/admin/reports
router.get(
  '/reports',
  asyncRoute(async (req, res) => {
    const [byService, byMechanic, byStatus, topCustomers] = await Promise.all([
      Booking.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: '$serviceType', jobs: { $sum: 1 }, revenue: { $sum: '$charges.total' } } },
        { $lookup: { from: 'servicetypes', localField: '_id', foreignField: '_id', as: 'service' } },
        { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
        { $project: { name: '$service.name', icon: '$service.icon', jobs: 1, revenue: 1 } },
        { $sort: { revenue: -1 } },
      ]),
      Booking.aggregate([
        { $match: { status: 'completed', mechanic: { $ne: null } } },
        { $group: { _id: '$mechanic', jobs: { $sum: 1 }, revenue: { $sum: '$charges.total' } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: { name: '$user.name', rating: '$user.mechanicProfile.ratingAverage', jobs: 1, revenue: 1 } },
        { $sort: { jobs: -1 } },
        { $limit: 10 },
      ]),
      Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Booking.aggregate([
        { $group: { _id: '$customer', bookings: { $sum: 1 }, spend: { $sum: '$charges.total' } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: { name: '$user.name', email: '$user.email', bookings: 1, spend: 1 } },
        { $sort: { spend: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.json({ byService, byMechanic, byStatus, topCustomers });
  })
);

// GET /api/admin/complaints
router.get(
  '/complaints',
  asyncRoute(async (req, res) => {
    const complaints = await Complaint.find(req.query.status ? { status: req.query.status } : {})
      .sort({ createdAt: -1 })
      .populate('raisedBy', 'name email role')
      .populate('against', 'name email role')
      .populate('booking', 'reference');
    res.json({ complaints });
  })
);

// PATCH /api/admin/complaints/:id
router.patch(
  '/complaints/:id',
  asyncRoute(async (req, res) => {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) throw notFound('Complaint not found');

    if (req.body.status) complaint.status = req.body.status;
    if (req.body.resolution) complaint.resolution = req.body.resolution;
    if (complaint.status === 'resolved') complaint.resolvedAt = new Date();
    await complaint.save();

    await notify(complaint.raisedBy, {
      title: `Complaint ${complaint.status.replace('_', ' ')}`,
      body: complaint.resolution || complaint.subject,
      type: 'system',
    });
    res.json({ complaint });
  })
);

// Coupon management
router.get(
  '/coupons',
  asyncRoute(async (req, res) => {
    res.json({ coupons: await Coupon.find().sort({ createdAt: -1 }) });
  })
);

router.post(
  '/coupons',
  asyncRoute(async (req, res) => {
    if (!req.body.code || req.body.value === undefined) throw badRequest('Code and value are required');
    const coupon = await Coupon.create(req.body);
    res.status(201).json({ coupon });
  })
);

router.patch(
  '/coupons/:id',
  asyncRoute(async (req, res) => {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!coupon) throw notFound('Coupon not found');
    res.json({ coupon });
  })
);

export default router;
