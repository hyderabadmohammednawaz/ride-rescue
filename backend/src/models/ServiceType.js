import mongoose from 'mongoose';

const serviceTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: String,
    category: {
      type: String,
      enum: ['breakdown', 'periodic', 'repair', 'cleaning'],
      default: 'repair',
    },
    basePrice: { type: Number, required: true },
    estimatedMinutes: { type: Number, default: 45 },
    icon: { type: String, default: '🔧' },
    isEmergency: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ServiceType = mongoose.model('ServiceType', serviceTypeSchema);
