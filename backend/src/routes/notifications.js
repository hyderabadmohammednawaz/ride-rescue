import express from 'express';
import { Notification } from '../models/Notification.js';
import { asyncRoute } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/notifications
router.get(
  '/',
  asyncRoute(async (req, res) => {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(Number(req.query.limit || 40)),
      Notification.countDocuments({ user: req.user._id, read: false }),
    ]);
    res.json({ notifications, unreadCount });
  })
);

// POST /api/notifications/read - mark one or all as read
router.post(
  '/read',
  asyncRoute(async (req, res) => {
    const filter = { user: req.user._id, read: false };
    if (req.body.id) filter._id = req.body.id;
    await Notification.updateMany(filter, { read: true });
    const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({ unreadCount });
  })
);

export default router;
