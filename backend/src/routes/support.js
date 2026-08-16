import express from 'express';
import { Complaint } from '../models/Complaint.js';
import { Coupon } from '../models/Coupon.js';
import { User } from '../models/User.js';
import { asyncRoute, badRequest } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyMany } from '../services/notifications.js';

const router = express.Router();
router.use(requireAuth);

// POST /api/support/complaints - any user can raise one
router.post(
  '/complaints',
  asyncRoute(async (req, res) => {
    const { subject, details, against, booking } = req.body;
    if (!subject) throw badRequest('A subject is required');

    const complaint = await Complaint.create({ raisedBy: req.user._id, subject, details, against, booking });
    const admins = await User.find({ role: 'admin' }).select('_id');
    await notifyMany(
      admins.map((a) => a._id),
      { title: 'New complaint raised', body: `${req.user.name}: ${subject}`, type: 'system', link: '/admin/complaints' }
    );
    res.status(201).json({ complaint });
  })
);

// GET /api/support/complaints - the signed-in user's own complaints
router.get(
  '/complaints',
  asyncRoute(async (req, res) => {
    const complaints = await Complaint.find({ raisedBy: req.user._id }).sort({ createdAt: -1 }).populate('booking', 'reference');
    res.json({ complaints });
  })
);

// GET /api/support/coupons - coupons a customer can use right now
router.get(
  '/coupons',
  asyncRoute(async (req, res) => {
    const coupons = await Coupon.find({
      active: true,
      $or: [{ validTill: null }, { validTill: { $gte: new Date() } }],
      $expr: { $lt: ['$usedCount', '$usageLimit'] },
    }).select('code description discountType value maxDiscount minOrderValue appliesTo validTill');
    res.json({ coupons });
  })
);

export default router;
