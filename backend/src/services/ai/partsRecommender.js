import { SparePart } from '../../models/SparePart.js';
import { Order } from '../../models/Order.js';
import { Booking } from '../../models/Booking.js';

/**
 * Recommends spare parts for a customer by blending three signals:
 *   1. fitment  - the part is listed for one of the customer's bike models
 *   2. history  - parts used in their past services, and popular repeat buys
 *   3. demand   - overall sales, so a new customer still gets sensible results
 * Parts already bought recently are pushed down so the list stays useful.
 */
export async function recommendParts(user, { limit = 8 } = {}) {
  const models = (user.vehicles || []).map((v) => `${v.make} ${v.model}`.trim());
  const makes = [...new Set((user.vehicles || []).map((v) => v.make))];

  const [pastOrders, pastBookings, catalogue] = await Promise.all([
    Order.find({ customer: user._id }).select('items createdAt').lean(),
    Booking.find({ customer: user._id, status: 'completed' }).select('partsUsed').lean(),
    SparePart.find({ active: true, stock: { $gt: 0 } }).lean(),
  ]);

  const purchasedSkus = new Set();
  const purchaseCountByCategory = new Map();
  for (const order of pastOrders) {
    for (const item of order.items || []) {
      purchasedSkus.add(item.sku);
    }
  }
  for (const booking of pastBookings) {
    for (const p of booking.partsUsed || []) {
      const key = String(p.part || '');
      purchaseCountByCategory.set(key, (purchaseCountByCategory.get(key) || 0) + 1);
    }
  }

  const maxSold = Math.max(1, ...catalogue.map((p) => p.unitsSold || 0));

  const scored = catalogue
    .map((part) => {
      const reasons = [];
      let score = 0;

      const fitsModel = (part.compatibleModels || []).some((m) =>
        models.some((mine) => mine.toLowerCase() === m.toLowerCase())
      );
      const fitsMake = (part.compatibleModels || []).some((m) =>
        makes.some((mk) => mk && m.toLowerCase().startsWith(mk.toLowerCase()))
      );

      if (fitsModel) {
        score += 0.45;
        reasons.push('Fits your bike model');
      } else if (fitsMake) {
        score += 0.2;
        reasons.push(`Fits ${makes[0]} bikes`);
      }

      if (purchaseCountByCategory.has(String(part._id))) {
        score += 0.2;
        reasons.push('Used in your previous service');
      }

      const popularity = (part.unitsSold || 0) / maxSold;
      score += popularity * 0.2;
      if (popularity > 0.6) reasons.push('Popular with other riders');

      if (part.ratingCount > 0 && part.ratingAverage >= 4.3) {
        score += 0.1;
        reasons.push(`Rated ${part.ratingAverage.toFixed(1)}★`);
      }

      if (purchasedSkus.has(part.sku)) {
        score -= 0.25; // already owns it
      }

      return { part, score: Number(score.toFixed(4)), reasons };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

/** Parts a mechanic is likely to need for a given service type - shown on the job screen. */
export async function partsForService(serviceSlug, vehicleModel) {
  const categoryBySlug = {
    'engine-oil-change': ['Lubricants', 'Filters'],
    'brake-service': ['Brakes'],
    'battery-jumpstart': ['Electrical'],
    'puncture-repair': ['Tyres'],
    'general-service': ['Lubricants', 'Filters', 'Brakes'],
    'chain-sprocket': ['Engine'],
  };
  const categories = categoryBySlug[serviceSlug] || ['Engine', 'Lubricants'];

  const query = { active: true, stock: { $gt: 0 }, category: { $in: categories } };
  if (vehicleModel) query.compatibleModels = new RegExp(vehicleModel, 'i');

  let parts = await SparePart.find(query).limit(6).lean();
  if (parts.length === 0) {
    delete query.compatibleModels;
    parts = await SparePart.find(query).limit(6).lean();
  }
  return parts;
}
