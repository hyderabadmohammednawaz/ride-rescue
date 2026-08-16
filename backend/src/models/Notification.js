import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    body: String,
    type: {
      type: String,
      enum: ['booking', 'order', 'payment', 'chat', 'system', 'reminder', 'sos'],
      default: 'system',
    },
    link: String, // in-app route the notification opens
    read: { type: Boolean, default: false },
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

export const Notification = mongoose.model('Notification', notificationSchema);
