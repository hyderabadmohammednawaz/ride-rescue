import mongoose from 'mongoose';

export const ORDER_STATUSES = ['placed', 'accepted', 'dispatched', 'delivered', 'cancelled'];

const orderSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [
      {
        part: { type: mongoose.Schema.Types.ObjectId, ref: 'SparePart', required: true },
        vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        name: String,
        sku: String,
        price: Number,
        quantity: Number,
        warrantyMonths: Number,
      },
    ],
    // An order can span several vendors; each sees only their own lines but
    // the status here reflects the slowest one.
    vendors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    status: { type: String, enum: ORDER_STATUSES, default: 'placed', index: true },
    statusHistory: [
      {
        status: { type: String, enum: ORDER_STATUSES },
        at: { type: Date, default: Date.now },
        note: String,
        _id: false,
      },
    ],
    subtotal: Number,
    deliveryFee: { type: Number, default: 40 },
    discount: { type: Number, default: 0 },
    couponCode: String,
    total: Number,
    deliveryAddress: String,
    paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    trackingNote: String,
    deliveredAt: Date,
  },
  { timestamps: true }
);

export const Order = mongoose.model('Order', orderSchema);
