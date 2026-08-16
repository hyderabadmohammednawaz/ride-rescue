import mongoose from 'mongoose';

const sparePartSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: 'text' },
    brand: String,
    sku: { type: String, required: true, unique: true },
    category: {
      type: String,
      enum: [
        'Engine',
        'Brakes',
        'Electrical',
        'Tyres',
        'Body',
        'Lubricants',
        'Accessories',
        'Filters',
      ],
      required: true,
      index: true,
    },
    description: String,
    price: { type: Number, required: true },
    mrp: Number,
    stock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    // Bike models this part fits, e.g. "Honda Activa 6G".
    compatibleModels: [{ type: String, index: true }],
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    warrantyMonths: { type: Number, default: 0 },
    image: String, // emoji or URL - kept simple so no asset hosting is needed
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    unitsSold: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const SparePart = mongoose.model('SparePart', sparePartSchema);
