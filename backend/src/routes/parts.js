import express from 'express';
import { SparePart } from '../models/SparePart.js';
import { asyncRoute, notFound } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { recommendParts } from '../services/ai/partsRecommender.js';

const router = express.Router();

// GET /api/parts - browse, search, filter
router.get(
  '/',
  asyncRoute(async (req, res) => {
    const { q, category, model, minPrice, maxPrice, inStock, sort = 'popular', limit = 60 } = req.query;
    const filter = { active: true };

    if (q) {
      const regex = new RegExp(String(q).trim(), 'i');
      filter.$or = [{ name: regex }, { brand: regex }, { sku: regex }, { compatibleModels: regex }];
    }
    if (category) filter.category = { $in: String(category).split(',') };
    if (model) filter.compatibleModels = new RegExp(String(model), 'i');
    if (inStock === 'true') filter.stock = { $gt: 0 };
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const sorts = {
      popular: { unitsSold: -1 },
      price_low: { price: 1 },
      price_high: { price: -1 },
      rating: { ratingAverage: -1 },
      newest: { createdAt: -1 },
    };

    const parts = await SparePart.find(filter)
      .sort(sorts[sort] || sorts.popular)
      .limit(Number(limit))
      .populate('vendor', 'name vendorProfile.shopName');

    const categories = await SparePart.distinct('category', { active: true });
    res.json({ parts, categories, count: parts.length });
  })
);

// GET /api/parts/recommended - AI recommendations for the signed-in customer
router.get(
  '/recommended',
  requireAuth,
  asyncRoute(async (req, res) => {
    const scored = await recommendParts(req.user, { limit: Number(req.query.limit || 8) });
    res.json({
      recommendations: scored.map((s) => ({ ...s.part, matchScore: s.score, reasons: s.reasons })),
    });
  })
);

// GET /api/parts/models - bike models the catalogue covers, for the search dropdown
router.get(
  '/models',
  asyncRoute(async (req, res) => {
    const models = await SparePart.distinct('compatibleModels', { active: true });
    res.json({ models: models.filter(Boolean).sort() });
  })
);

// GET /api/parts/:id
router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const part = await SparePart.findById(req.params.id).populate('vendor', 'name phone vendorProfile');
    if (!part) throw notFound('Part not found');

    const related = await SparePart.find({
      _id: { $ne: part._id },
      active: true,
      $or: [{ category: part.category }, { compatibleModels: { $in: part.compatibleModels } }],
    })
      .limit(4)
      .lean();

    res.json({ part, related });
  })
);

export default router;
