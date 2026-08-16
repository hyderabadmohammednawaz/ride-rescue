import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['upi', 'card', 'wallet', 'cash'], required: true },
    status: { type: String, enum: ['pending', 'success', 'failed', 'refunded'], default: 'pending' },
    purpose: { type: String, enum: ['booking', 'order', 'wallet_topup'], required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    // Populated by Razorpay when live keys are configured; synthetic otherwise.
    gateway: { type: String, default: 'mock' },
    gatewayPaymentId: String,
    paidAt: Date,
  },
  { timestamps: true }
);

export const Payment = mongoose.model('Payment', paymentSchema);
