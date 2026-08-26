import express from 'express';
import { Booking } from '../models/Booking.js';
import { Review } from '../models/Review.js';
import { asyncRoute, badRequest } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, requireRole('mechanic'));

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// GET /api/mechanic/dashboard
router.get(
  '/dashboard',
  asyncRoute(async (req, res) => {
    const today = startOfDay();
    const [active, todayJobs, pending, completedToday] = await Promise.all([
      Booking.find({ mechanic: req.user._id, status: { $in: ['accepted', 'arrived', 'in_progress'] } })
        .populate('customer', 'name phone avatarColor')
        .populate('serviceType', 'name icon')
        .sort({ createdAt: 1 }),
      Booking.countDocuments({ mechanic: req.user._id, createdAt: { $gte: today } }),
      Booking.countDocuments({ status: 'pending', mechanic: null }),
      Booking.find({ mechanic: req.user._id, status: 'completed', completedAt: { $gte: today } }).lean(),
    ]);

    res.json({
      // Report what is stored, not an optimistic default. Dispatch matches on
      // `mechanicProfile.isAvailable: true` exactly, so a missing field means
      // invisible — and reporting `?? true` told the mechanic they were online
      // while no job could ever reach them.
      isAvailable: req.user.mechanicProfile?.isAvailable === true,
      activeJobs: active,
      stats: {
        todayJobs,
        openRequests: pending,
        completedToday: completedToday.length,
        todayEarnings: completedToday.reduce((s, b) => s + (b.charges?.labour || 0) + (b.charges?.visitFee || 0), 0),
        rating: req.user.mechanicProfile?.ratingAverage || 0,
        ratingCount: req.user.mechanicProfile?.ratingCount || 0,
        totalCompleted: req.user.mechanicProfile?.completedJobs || 0,
      },
    });
  })
);

// PATCH /api/mechanic/availability - go online / offline
router.patch(
  '/availability',
  asyncRoute(async (req, res) => {
    // Require an explicit boolean. Boolean(req.body.isAvailable) turned a
    // missing, misspelled or malformed field into `false`, so a bad request
    // quietly took a mechanic off the map — the one state change nobody would
    // think to check for.
    if (typeof req.body.isAvailable !== 'boolean') {
      throw badRequest('isAvailable must be true or false');
    }

    // Registration sets this, but an account created before the field existed
    // would have no mechanicProfile at all.
    if (!req.user.mechanicProfile) req.user.mechanicProfile = {};
    req.user.mechanicProfile.isAvailable = req.body.isAvailable;
    await req.user.save();
    res.json({ isAvailable: req.user.mechanicProfile.isAvailable });
  })
);

// GET /api/mechanic/earnings - daily / weekly / monthly breakdown
router.get(
  '/earnings',
  asyncRoute(async (req, res) => {
    const jobs = await Booking.find({ mechanic: req.user._id, status: 'completed' })
      .select('reference charges completedAt paymentStatus')
      .sort({ completedAt: -1 })
      .lean();

    // The mechanic keeps labour and visit fee; parts revenue belongs to the vendor.
    const earn = (b) => (b.charges?.labour || 0) + (b.charges?.visitFee || 0);
    const now = Date.now();
    const since = (days) => jobs.filter((b) => now - new Date(b.completedAt).getTime() <= days * 86400000);

    const byDay = new Map();
    for (const job of jobs) {
      const key = new Date(job.completedAt).toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + earn(job));
    }

    res.json({
      today: since(1).reduce((s, b) => s + earn(b), 0),
      week: since(7).reduce((s, b) => s + earn(b), 0),
      month: since(30).reduce((s, b) => s + earn(b), 0),
      lifetime: jobs.reduce((s, b) => s + earn(b), 0),
      unpaidAmount: jobs.filter((b) => b.paymentStatus !== 'paid').reduce((s, b) => s + earn(b), 0),
      jobCount: jobs.length,
      byDay: [...byDay.entries()].sort().slice(-14).map(([date, amount]) => ({ date, amount })),
      recent: jobs.slice(0, 15).map((b) => ({ reference: b.reference, amount: earn(b), completedAt: b.completedAt, paymentStatus: b.paymentStatus })),
    });
  })
);

// GET /api/mechanic/history - completed jobs with the customer's rating
router.get(
  '/history',
  asyncRoute(async (req, res) => {
    const [jobs, reviews] = await Promise.all([
      Booking.find({ mechanic: req.user._id, status: { $in: ['completed', 'cancelled'] } })
        .sort({ updatedAt: -1 })
        .limit(50)
        .populate('customer', 'name avatarColor')
        .populate('serviceType', 'name icon'),
      Review.find({ mechanic: req.user._id }).lean(),
    ]);

    const reviewByBooking = new Map(reviews.map((r) => [String(r.booking), r]));
    res.json({
      jobs: jobs.map((j) => ({ ...j.toObject(), review: reviewByBooking.get(String(j._id)) || null })),
    });
  })
);

export default router;
