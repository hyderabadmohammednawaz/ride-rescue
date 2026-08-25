'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, rupees } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useToast } from '@/components/Toast';
import { Spinner, Stars } from '@/components/ui';
import type { SparePart } from '@/lib/types';

function PartDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') as string;
  const { add, wishlist, toggleWishlist } = useCart();
  const { push } = useToast();
  const [part, setPart] = useState<SparePart | null>(null);
  const [related, setRelated] = useState<SparePart[]>([]);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    api<{ part: SparePart; related: SparePart[] }>(`/parts/${id}`).then((d) => {
      setPart(d.part);
      setRelated(d.related);
    });
  }, [id]);

  if (!part) return <Spinner />;

  const saved = wishlist.includes(part._id);
  const discount = part.mrp && part.mrp > part.price ? Math.round(((part.mrp - part.price) / part.mrp) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/customer/store" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
        ← Back to store
      </Link>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="card flex items-center justify-center bg-slate-50 py-16 dark:bg-slate-800/40">
          <span className="text-[7rem] leading-none">{part.image || '🔩'}</span>
        </div>

        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{part.category}</span>
              <h1 className="mt-2 text-2xl font-bold leading-tight">{part.name}</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                by {part.brand} · SKU <span className="font-mono text-xs">{part.sku}</span>
              </p>
            </div>
            <button onClick={() => toggleWishlist(part._id)} className="text-2xl transition hover:scale-110">
              {saved ? '❤️' : '🤍'}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-sm">
            <Stars value={part.ratingAverage} size="lg" />
            <span className="text-slate-600 dark:text-slate-400">
              {part.ratingAverage.toFixed(1)} · {part.ratingCount} ratings · {part.unitsSold} sold
            </span>
          </div>

          <div className="mt-5 flex items-baseline gap-3">
            <span className="text-3xl font-extrabold">{rupees(part.price)}</span>
            {discount > 0 && (
              <>
                <span className="text-lg text-slate-400 line-through">{rupees(part.mrp)}</span>
                <span className="badge bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {discount}% off
                </span>
              </>
            )}
          </div>

          <p className={`mt-2 text-sm font-medium ${part.stock === 0 ? 'text-red-600' : part.stock <= 5 ? 'text-amber-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {part.stock === 0 ? '✕ Out of stock' : part.stock <= 5 ? `⚠ Only ${part.stock} left in stock` : '✓ In stock'}
          </p>

          {part.description && <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{part.description}</p>}

          <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/50">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Warranty</dt>
              <dd className="font-semibold">{part.warrantyMonths > 0 ? `${part.warrantyMonths} months` : 'Not applicable'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Sold by</dt>
              <dd className="font-semibold">{part.vendor?.vendorProfile?.shopName || part.vendor?.name || 'RideRescue'}</dd>
            </div>
          </dl>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Fits these models</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {part.compatibleModels.slice(0, 8).map((m) => (
                <span key={m} className="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                  {m}
                </span>
              ))}
              {part.compatibleModels.length > 8 && (
                <span className="rounded-lg px-2 py-1 text-xs text-slate-500">+{part.compatibleModels.length - 8} more</span>
              )}
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700">
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-4 py-2.5 text-lg">−</button>
              <span className="w-10 text-center font-semibold">{quantity}</span>
              <button onClick={() => setQuantity((q) => Math.min(part.stock, q + 1))} className="px-4 py-2.5 text-lg">+</button>
            </div>
            <button
              onClick={() => {
                add(part, quantity);
                push(`${quantity} × ${part.name} added to cart`, 'success');
              }}
              disabled={part.stock === 0}
              className="btn-primary flex-1 py-3"
            >
              Add to cart
            </button>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Related parts</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => (
              <Link key={r._id} href={`/customer/store/detail?id=${r._id}`} className="card transition hover:border-brand-400">
                <span className="text-3xl">{r.image || '🔩'}</span>
                <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-tight">{r.name}</h3>
                <p className="mt-1 font-bold text-brand-600 dark:text-brand-400">{rupees(r.price)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function PartDetailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PartDetailContent />
    </Suspense>
  );
}
