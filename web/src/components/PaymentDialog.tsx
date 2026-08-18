'use client';

import { useEffect, useState } from 'react';
import { api, rupees } from '@/lib/api';
import { openCheckout, type CheckoutOptions } from '@/lib/razorpay';
import { useToast } from './Toast';

const METHODS = [
  { value: 'upi', label: 'UPI', icon: '📲', hint: 'GPay, PhonePe, Paytm' },
  { value: 'card', label: 'Card', icon: '💳', hint: 'Credit or debit' },
  { value: 'wallet', label: 'Wallet', icon: '👛', hint: 'RideRescue balance' },
  { value: 'cash', label: 'Cash', icon: '💵', hint: 'Pay the mechanic directly' },
];

/**
 * Runs the create → gateway → confirm sequence. With Razorpay keys configured
 * the backend returns real checkout options; without them the same flow runs
 * against a mock gateway so the demo works offline.
 */
export function PaymentDialog({
  amount,
  purpose,
  bookingId,
  orderId,
  walletBalance = 0,
  onPaid,
  onClose,
}: {
  amount: number;
  purpose: 'booking' | 'order';
  bookingId?: string;
  orderId?: string;
  walletBalance?: number;
  onPaid: () => void;
  onClose: () => void;
}) {
  const [method, setMethod] = useState('upi');
  const [busy, setBusy] = useState(false);
  const [gateway, setGateway] = useState<'razorpay' | 'mock' | null>(null);
  const { push } = useToast();

  // Ask the server which gateway is actually configured rather than assuming.
  useEffect(() => {
    api<{ paymentGateway: 'razorpay' | 'mock' }>('/auth/config', { auth: false })
      .then((c) => setGateway(c.paymentGateway))
      .catch(() => setGateway(null));
  }, []);

  const pay = async () => {
    setBusy(true);
    try {
      const created = await api<{
        payment: { _id: string };
        gateway: string;
        checkout: CheckoutOptions;
      }>('/payments/create', {
        method: 'POST',
        // This build can open Razorpay checkout and return a signature, so it
        // opts in to the real gateway.
        body: { purpose, bookingId, orderId, method, supportsCheckout: true },
      });

      // With keys configured the customer pays in Razorpay's own sheet and we
      // get back a signature; the mock gateway settles instantly instead.
      let confirmBody: object = {};
      if (created.gateway === 'razorpay') {
        // Carry the customer's choice through, so the sheet opens on the
        // instrument they picked rather than Razorpay's default tab.
        confirmBody = await openCheckout({
          ...created.checkout,
          method: method === 'upi' || method === 'card' ? method : undefined,
        });
      }

      const confirmed = await api<{ message: string }>(`/payments/${created.payment._id}/confirm`, {
        method: 'POST',
        body: confirmBody,
      });

      push(confirmed.message || 'Payment successful', 'success');
      onPaid();
      onClose();
    } catch (err: any) {
      // Closing the sheet is not an error - the payment stays pending and the
      // customer can try again.
      if (err.message === 'CHECKOUT_DISMISSED') {
        push('Payment cancelled', 'info');
        return;
      }
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md animate-slideUp rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">Complete payment</h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">Choose how you would like to pay</p>
          </div>
          <button onClick={onClose} className="btn-ghost px-2 py-1">✕</button>
        </div>

        <div className="my-5 rounded-xl bg-brand-50 p-4 text-center dark:bg-brand-500/10">
          <p className="text-sm text-slate-600 dark:text-slate-400">Amount payable</p>
          <p className="text-3xl font-extrabold text-brand-700 dark:text-brand-300">{rupees(amount)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {METHODS.map((m) => {
            const disabled = m.value === 'wallet' && walletBalance < amount;
            return (
              <button
                key={m.value}
                onClick={() => !disabled && setMethod(m.value)}
                disabled={disabled}
                className={`rounded-xl border px-3 py-3 text-left transition disabled:opacity-40 ${
                  method === m.value
                    ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                }`}
              >
                <span className="text-lg">{m.icon}</span>
                <p className="mt-1 text-sm font-semibold">{m.label}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {m.value === 'wallet' ? `Balance ${rupees(walletBalance)}` : m.hint}
                </p>
              </button>
            );
          })}
        </div>

        {gateway === 'mock' && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            No Razorpay keys are configured, so this settles against a mock gateway. Add RAZORPAY_KEY_ID
            and RAZORPAY_KEY_SECRET on the server to switch to real test payments.
          </p>
        )}

        {gateway === 'razorpay' && !['wallet', 'cash'].includes(method) && (
          <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
            Razorpay <strong>test mode</strong> — no real money moves. Pay with UPI id{' '}
            <code className="font-mono font-semibold">success@razorpay</code> (or{' '}
            <code className="font-mono font-semibold">failure@razorpay</code> to see a decline).
            <br />
            Test <em>cards</em> are listed in Razorpay&apos;s docs — the widely quoted
            4111&nbsp;1111&nbsp;1111&nbsp;1111 is an <strong>international</strong> card and Indian
            accounts reject it with &ldquo;International cards are not supported&rdquo;.
          </p>
        )}

        <button onClick={pay} disabled={busy} className="btn-primary mt-4 w-full py-3">
          {busy ? 'Processing…' : `Pay ${rupees(amount)}`}
        </button>
      </div>
    </div>
  );
}
