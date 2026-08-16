import mongoose from 'mongoose';

const complaintSchema = new mongoose.Schema(
  {
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    against: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    subject: { type: String, required: true },
    details: String,
    status: { type: String, enum: ['open', 'in_review', 'resolved'], default: 'open', index: true },
    resolution: String,
    resolvedAt: Date,
  },
  { timestamps: true }
);

export const Complaint = mongoose.model('Complaint', complaintSchema);
