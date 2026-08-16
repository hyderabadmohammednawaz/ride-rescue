import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ['customer', 'mechanic'], required: true },
    text: { type: String, required: true },
    readAt: Date,
  },
  { timestamps: true }
);

export const Message = mongoose.model('Message', messageSchema);
