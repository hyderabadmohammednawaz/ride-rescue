import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env.js';

/**
 * Razorpay, used in Test Mode.
 *
 * Test keys (rzp_test_…) cost nothing, need no KYC, and accept Razorpay's
 * published test cards, so the whole checkout is demonstrable without moving a
 * rupee. Swapping in live keys is the only change needed for real money — no
 * code differs between the two.
 *
 * With no keys configured the app falls back to a mock gateway that settles
 * instantly, so the demo still runs offline and the regression suite does not
 * need network access.
 */
export const gatewayLive = () => Boolean(env.razorpayKeyId && env.razorpayKeySecret);

let client = null;
function sdk() {
  if (!client) {
    client = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  }
  return client;
}

/**
 * Creates the Razorpay order that checkout needs.
 *
 * Checkout cannot open without a server-created order id, and the id is also
 * what makes the signature meaningful: it ties the payment to an amount we
 * chose, rather than one the browser claimed.
 *
 * Amounts go to Razorpay in paise, as integers.
 */
export async function createOrder({ amountRupees, receipt, notes }) {
  const order = await sdk().orders.create({
    amount: Math.round(amountRupees * 100),
    currency: 'INR',
    receipt,
    notes,
  });
  return order;
}

/**
 * Verifies checkout's callback signature.
 *
 * `orderId` must be the id we stored when creating the order. Verifying against
 * an order id echoed back by the client would let a valid signature from any
 * other order be replayed against this payment.
 */
export function verifySignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  // Both are hex digests of the same length, so a timing-safe compare is cheap.
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
