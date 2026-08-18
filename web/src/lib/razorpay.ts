/**
 * Razorpay Checkout, loaded on demand.
 *
 * The script comes from Razorpay's CDN and cannot be bundled — checkout has to
 * run from their origin so card details are entered in their iframe and never
 * touch our page or our servers. That is also why this is the only third-party
 * script the app loads.
 */

export interface CheckoutOptions {
  key: string;
  amountPaise: number;
  currency: string;
  orderId: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
  /** The instrument the customer picked in our dialog, if it maps to a gateway one. */
  method?: 'upi' | 'card';
}

/**
 * Opens checkout on the instrument the customer already chose.
 *
 * Without this the sheet ignores our selection and opens on its own default
 * tab - pick UPI in our dialog and Razorpay still shows Card, which reads as
 * the app losing the choice. `show_default_blocks: false` suppresses Razorpay's
 * standard list so only the chosen block remains.
 *
 * Anything unrecognised falls through to the default sheet rather than risking
 * a configuration that shows no methods at all.
 */
function displayConfig(method?: string) {
  if (method !== 'upi' && method !== 'card') return undefined;
  return {
    display: {
      blocks: {
        chosen: {
          name: method === 'upi' ? 'Pay via UPI' : 'Pay by card',
          instruments: [{ method }],
        },
      },
      sequence: ['block.chosen'],
      preferences: { show_default_blocks: false },
    },
  };
}

export interface CheckoutResult {
  razorpayPaymentId: string;
  razorpaySignature: string;
}

const SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loader: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Checkout needs a browser'));
  if ((window as any).Razorpay) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      loader = null; // let a later attempt retry rather than reusing a rejected promise
      reject(new Error('Could not load the payment gateway. Check your connection and try again.'));
    };
    document.body.appendChild(el);
  });
  return loader;
}

/**
 * Opens checkout and resolves once Razorpay reports success.
 *
 * Dismissing the sheet rejects, so the caller can leave the payment pending
 * rather than marking it failed — the customer simply changed their mind.
 */
export async function openCheckout(options: CheckoutOptions): Promise<CheckoutResult> {
  await loadScript();

  return new Promise<CheckoutResult>((resolve, reject) => {
    let settled = false;

    const rzp = new (window as any).Razorpay({
      key: options.key,
      amount: options.amountPaise,
      currency: options.currency,
      order_id: options.orderId,
      name: options.name,
      description: options.description,
      prefill: options.prefill,
      config: displayConfig(options.method),
      theme: { color: '#2563eb' },
      handler: (res: any) => {
        settled = true;
        resolve({
          razorpayPaymentId: res.razorpay_payment_id,
          razorpaySignature: res.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => {
          if (!settled) reject(new Error('CHECKOUT_DISMISSED'));
        },
      },
    });

    rzp.on('payment.failed', (res: any) => {
      settled = true;
      reject(new Error(res?.error?.description || 'The payment was declined.'));
    });

    rzp.open();
  });
}
