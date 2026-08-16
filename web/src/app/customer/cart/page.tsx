'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, rupees } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useToast } from '@/components/Toast';
import { PaymentDialog } from '@/components/PaymentDialog';
import { EmptyState, SectionTitle } from '@/components/ui';
import type { Order } from '@/lib/types';

interface Coupon {
  code: string;
  description: string;
  discountType: string;
  value: number;
  minOrderValue: number;
}

export default function CartPage() {
  const { lines, setQuantity, remove, clear, subtotal } = useCart();
  const { user, refresh } = useAuth();
  const { push } = useToast();
  const router = useRouter();

  const [address, setAddress] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [quote, setQuote] = useState<{ subtotal: number; discount: number; deliveryFee: number; total: number } | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ coupons: Coupon[] }>('/support/coupons').then((d) => setCoupons(d.coupons)).catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.location?.address && !address) setAddress(`${user.location.address}, Hyderabad`);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-price whenever the cart or coupon changes; the server is the authority on totals.
  useEffect(() => {
    if (lines.length === 0) {
      setQuote(null);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const q = await api<any>('/orders/quote', {
          method: 'POST',
          body: { items: lines.map((l) => ({ partId: l.partId, quantity: l.quantity })), couponCode: couponCode || undefined },
        });
        setQuote(q);
      } catch (err: any) {
        setQuote(null);
        if (couponCode) push(err.message, 'error');
      }
    }, 250);
    return () => clearTimeout(id);
  }, [lines, couponCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const placeOrder = async () => {
    if (!address.trim()) {
      push('Enter a delivery address', 'error');
      return;
    }
    setBusy(true);
    try {
      const { order } = await api<{ order: Order }>('/orders', {
        method: 'POST',
        body: {
          items: lines.map((l) => ({ partId: l.partId, quantity: l.quantity })),
          deliveryAddress: address,
          couponCode: couponCode || undefined,
        },
      });
      clear();
      setPlaced(order);
    } catch (err: any) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (lines.length === 0 && !placed) {
    return (
      <EmptyState
        icon="🛒"
        title="Your cart is empty"
        hint="Browse genuine spare parts filtered to your bike model."
        action={
          <Link href="/customer/store" className="btn-primary">
            Browse the store
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <SectionTitle title="Your cart" subtitle={`${lines.length} product(s) ready to order`} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {lines.map((line) => (
            <div key={line.partId} className="card flex items-center gap-4">
              <span className="text-3xl">{line.image || '🔩'}</span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold">{line.name}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{rupees(line.price)} each</p>
              </div>
              <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700">
                <button onClick={() => setQuantity(line.partId, line.quantity - 1)} className="px-3 py-2">−</button>
                <span className="w-8 text-center text-sm font-semibold">{line.quantity}</span>
                <button onClick={() => setQuantity(line.partId, line.quantity + 1)} className="px-3 py-2">+</button>
              </div>
              <div className="w-20 text-right font-bold">{rupees(line.price * line.quantity)}</div>
              <button onClick={() => remove(line.partId)} className="text-slate-400 transition hover:text-red-600" aria-label="Remove">
                ✕
              </button>
            </div>
          ))}

          <div className="card">
            <label className="label" htmlFor="address">Delivery address</label>
            <textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              className="input"
              placeholder="Flat, street, area, city, pincode"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="font-bold">Apply a coupon</h3>
            <div className="mt-3 flex gap-2">
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Enter code"
                className="input"
              />
              {couponCode && (
                <button onClick={() => setCouponCode('')} className="btn-secondary px-3 text-sm">
                  Clear
                </button>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {coupons.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setCouponCode(c.code)}
                  className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-left transition hover:border-brand-400 dark:border-slate-700"
                >
                  <p className="font-mono text-sm font-bold text-brand-600 dark:text-brand-400">{c.code}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{c.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold">Order summary</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Subtotal</dt>
                <dd>{rupees(quote?.subtotal ?? subtotal)}</dd>
              </div>
              {(quote?.discount ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <dt>Coupon {couponCode}</dt>
                  <dd>−{rupees(quote!.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Delivery</dt>
                <dd>{quote?.deliveryFee === 0 ? <span className="text-emerald-600 dark:text-emerald-400">FREE</span> : rupees(quote?.deliveryFee ?? 40)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-bold dark:border-slate-800">
                <dt>Total</dt>
                <dd>{rupees(quote?.total ?? subtotal + 40)}</dd>
              </div>
            </dl>
            <button onClick={placeOrder} disabled={busy || lines.length === 0} className="btn-primary mt-4 w-full py-3">
              {busy ? 'Placing order…' : 'Place order'}
            </button>
            <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
              Free delivery on orders above ₹999
            </p>
          </div>
        </div>
      </div>

      {placed && (
        <PaymentDialog
          amount={placed.total}
          purpose="order"
          orderId={placed._id}
          walletBalance={user?.walletBalance || 0}
          onPaid={async () => {
            await refresh();
            router.push('/customer/orders');
          }}
          onClose={() => {
            setPlaced(null);
            router.push('/customer/orders');
          }}
        />
      )}
    </div>
  );
}
