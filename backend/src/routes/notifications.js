import express from 'express';
import { Notification } from '../models/Notification.js';
import { asyncRoute } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { normaliseLink } from '../services/links.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/notifications
router.get(
  '/',
  asyncRoute(async (req, res) => {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(Number(req.query.limit || 40)).lean(),
      Notification.countDocuments({ user: req.user._id, read: false }),
    ]);

    // Notifications keep whatever route was current when they were created, and
    // the web app's paths changed when it moved to a static export. Rewriting on
    // read repairs the whole history at no cost; a migration would have to be
    // written, run, and remembered.
    res.json({
      notifications: notifications.map((n) => ({ ...n, link: normaliseLink(n.link) })),
      unreadCount,
    });
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
