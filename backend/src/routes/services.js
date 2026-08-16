import express from 'express';
import { ServiceType } from '../models/ServiceType.js';
import { User } from '../models/User.js';
import { Review } from '../models/Review.js';
import { asyncRoute, notFound } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { rankMechanics } from '../services/ai/mechanicMatch.js';

const router = express.Router();

// GET /api/services - public catalogue
router.get(
  '/',
  asyncRoute(async (req, res) => {
    const services = await ServiceType.find({ active: true }).sort({ category: 1, basePrice: 1 });
    res.json({ services });
  })
);

// GET /api/services/mechanics/nearby - AI-ranked mechanics around a point
router.get(
  '/mechanics/nearby',
  requireAuth,
  asyncRoute(async (req, res) => {
    const lng = Number(req.query.lng ?? req.user.location?.coordinates?.[0]);
    const lat = Number(req.query.lat ?? req.user.location?.coordinates?.[1]);
    const radiusKm = Number(req.query.radiusKm || 20);
    const isEmergency = req.query.emergency === 'true';

    const { ranked, consideredCount } = await rankMechanics([lng, lat], {
      radiusKm,
      isEmergency,
      limit: Number(req.query.limit || 10),
      favouriteIds: req.user.favouriteMechanics,
    });

    res.json({
      consideredCount,
      mechanics: ranked.map((r) => ({
        _id: r.mechanic._id,
        name: r.mechanic.name,
        phone: r.mechanic.phone,
        avatarColor: r.mechanic.avatarColor,
        coordinates: r.mechanic.location.coordinates,
        experienceYears: r.mechanic.mechanicProfile?.experienceYears || 0,
        specialisations: r.mechanic.mechanicProfile?.specialisations || [],
        rating: r.mechanic.mechanicProfile?.ratingAverage || 0,
        ratingCount: r.mechanic.mechanicProfile?.ratingCount || 0,
        hourlyRate: r.mechanic.mechanicProfile?.hourlyRate,
        distanceKm: r.distanceKm,
        etaMinutes: r.etaMinutes,
        activeJobs: r.activeJobs,
        matchScore: r.score,
        reasons: r.reasons,
        breakdown: r.breakdown,
        isFavourite: (req.user.favouriteMechanics || []).some((f) => String(f) === String(r.mechanic._id)),
      })),
    });
  })
);

// GET /api/services/mechanics/:id - public mechanic profile with reviews
router.get(
  '/mechanics/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const mechanic = await User.findOne({ _id: req.params.id, role: 'mechanic' }).select('-passwordHash');
    if (!mechanic) throw notFound('Mechanic not found');
    const reviews = await Review.find({ mechanic: mechanic._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('customer', 'name avatarColor');
    res.json({ mechanic, reviews });
  })
);

export default router;
