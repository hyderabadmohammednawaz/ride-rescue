import mongoose from 'mongoose';

export const BOOKING_STATUSES = [
  'pending', // created, waiting for a mechanic to accept
  'accepted', // mechanic accepted, heading over
  'arrived', // mechanic reached the customer
  'in_progress', // work under way
  'completed', // work finished, awaiting or settled payment
  'cancelled',
];

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: BOOKING_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    note: String,
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mechanic: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    serviceType: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceType' },
    vehicle: {
      make: String,
      model: String,
      registrationNumber: String,
    },
    kind: { type: String, enum: ['sos', 'instant', 'scheduled'], default: 'instant' },
    status: { type: String, enum: BOOKING_STATUSES, default: 'pending', index: true },
    statusHistory: [statusEventSchema],
    description: String,
    scheduledFor: Date,
    // Where the customer (and their bike) is.
    pickupLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
      address: String,
    },
    // Latest known mechanic position, pushed over Socket.IO while en route.
    mechanicLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: [Number],
      updatedAt: Date,
    },
    etaMinutes: Number,
    distanceKm: Number,
    // Snapshot of why the AI picked this mechanic - shown in the UI and useful in the viva.
    recommendation: {
      score: Number,
      reasons: [String],
      consideredCount: Number,
    },
    charges: {
      labour: { type: Number, default: 0 },
      parts: { type: Number, default: 0 },
      visitFee: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    partsUsed: [
      {
        part: { type: mongoose.Schema.Types.ObjectId, ref: 'SparePart' },
        name: String,
        quantity: Number,
        price: Number,
      },
    ],
    paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    otpCode: String, // customer reads this out so the mechanic can start the job
    qrToken: String, // QR-code service verification
    rated: { type: Boolean, default: false },
    cancelledBy: { type: String, enum: ['customer', 'mechanic', 'admin'] },
    cancellationReason: String,
    completedAt: Date,
  },
  { timestamps: true }
);

bookingSchema.index({ pickupLocation: '2dsphere' });

export const Booking = mongoose.model('Booking', bookingSchema);
