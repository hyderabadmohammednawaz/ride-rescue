import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    description: String,
    discountType: { type: String, enum: ['percent', 'flat'], default: 'percent' },
    value: { type: Number, required: true },
    maxDiscount: { type: Number, default: 500 },
    minOrderValue: { type: Number, default: 0 },
    appliesTo: { type: String, enum: ['booking', 'order', 'both'], default: 'both' },
    validTill: Date,
    usageLimit: { type: Number, default: 1000 },
    usedCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Coupon = mongoose.model('Coupon', couponSchema);
