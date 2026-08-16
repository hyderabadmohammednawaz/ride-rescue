import express from 'express';
import { SparePart } from '../models/SparePart.js';
import { Order } from '../models/Order.js';
import { asyncRoute, badRequest, forbidden, notFound } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, requireRole('vendor', 'admin'));

const vendorFilter = (req) => (req.user.role === 'admin' && req.query.vendorId ? { vendor: req.query.vendorId } : { vendor: req.user._id });

// GET /api/vendor/products
router.get(
  '/products',
  asyncRoute(async (req, res) => {
    const products = await SparePart.find(vendorFilter(req)).sort({ createdAt: -1 });
    res.json({ products });
  })
);

// POST /api/vendor/products
router.post(
  '/products',
  asyncRoute(async (req, res) => {
    const { name, sku, category, price } = req.body;
    if (!name || !sku || !category || price === undefined) {
      throw badRequest('Name, SKU, category and price are required');
    }
    const product = await SparePart.create({
      ...req.body,
      compatibleModels: Array.isArray(req.body.compatibleModels)
        ? req.body.compatibleModels
        : String(req.body.compatibleModels || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
      vendor: req.user.role === 'admin' && req.body.vendorId ? req.body.vendorId : req.user._id,
    });
    res.status(201).json({ product });
  })
);

// PATCH /api/vendor/products/:id
router.patch(
  '/products/:id',
  asyncRoute(async (req, res) => {
    const product = await SparePart.findById(req.params.id);
    if (!product) throw notFound('Product not found');
    if (req.user.role !== 'admin' && String(product.vendor) !== String(req.user._id)) {
      throw forbidden('This is not your product');
    }

    const editable = ['name', 'brand', 'category', 'description', 'price', 'mrp', 'stock', 'lowStockThreshold', 'warrantyMonths', 'image', 'active'];
    for (const key of editable) {
      if (req.body[key] !== undefined) product[key] = req.body[key];
    }
    if (req.body.compatibleModels !== undefined) {
      product.compatibleModels = Array.isArray(req.body.compatibleModels)
        ? req.body.compatibleModels
        : String(req.body.compatibleModels).split(',').map((s) => s.trim()).filter(Boolean);
    }
    await product.save();
    res.json({ product });
  })
);

// DELETE /api/vendor/products/:id - soft delete keeps past orders readable
router.delete(
  '/products/:id',
  asyncRoute(async (req, res) => {
    const product = await SparePart.findById(req.params.id);
    if (!product) throw notFound('Product not found');
    if (req.user.role !== 'admin' && String(product.vendor) !== String(req.user._id)) {
      throw forbidden('This is not your product');
    }
    product.active = false;
    await product.save();
    res.json({ message: 'Product removed from the store' });
  })
);

// GET /api/vendor/inventory - stock overview with low-stock alerts
router.get(
  '/inventory',
  asyncRoute(async (req, res) => {
    const products = await SparePart.find({ ...vendorFilter(req), active: true }).sort({ stock: 1 });
    const lowStock = products.filter((p) => p.stock <= p.lowStockThreshold);
    res.json({
      products,
      lowStock,
      summary: {
        skuCount: products.length,
        outOfStock: products.filter((p) => p.stock === 0).length,
        lowStockCount: lowStock.length,
        inventoryValue: products.reduce((sum, p) => sum + p.price * p.stock, 0),
      },
    });
  })
);

// GET /api/vendor/sales - revenue and best sellers
router.get(
  '/sales',
  asyncRoute(async (req, res) => {
    const vendorId = req.user.role === 'admin' && req.query.vendorId ? req.query.vendorId : req.user._id;
    const orders = await Order.find({ vendors: vendorId, status: { $ne: 'cancelled' } }).lean();

    let revenue = 0;
    let unitsSold = 0;
    const bySku = new Map();
    const byDay = new Map();

    for (const order of orders) {
      const mine = order.items.filter((i) => String(i.vendor) === String(vendorId));
      const orderRevenue = mine.reduce((s, i) => s + i.price * i.quantity, 0);
      revenue += orderRevenue;

      const day = new Date(order.createdAt).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + orderRevenue);

      for (const item of mine) {
        unitsSold += item.quantity;
        const entry = bySku.get(item.sku) || { sku: item.sku, name: item.name, units: 0, revenue: 0 };
        entry.units += item.quantity;
        entry.revenue += item.price * item.quantity;
        bySku.set(item.sku, entry);
      }
    }

    const now = Date.now();
    const within = (days) =>
      orders
        .filter((o) => now - new Date(o.createdAt).getTime() <= days * 86400000)
        .reduce((s, o) => s + o.items.filter((i) => String(i.vendor) === String(vendorId)).reduce((t, i) => t + i.price * i.quantity, 0), 0);

    res.json({
      revenue,
      unitsSold,
      orderCount: orders.length,
      today: within(1),
      week: within(7),
      month: within(30),
      pendingDispatch: orders.filter((o) => ['placed', 'accepted'].includes(o.status)).length,
      bestSellers: [...bySku.values()].sort((a, b) => b.units - a.units).slice(0, 8),
      revenueByDay: [...byDay.entries()].sort().slice(-14).map(([date, amount]) => ({ date, amount })),
    });
  })
);

export default router;
