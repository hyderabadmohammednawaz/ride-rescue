'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, rupees } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useToast } from '@/components/Toast';
import { EmptyState, SectionTitle, Spinner, Stars } from '@/components/ui';
import type { SparePart } from '@/lib/types';

const SORTS = [
  { value: 'popular', label: 'Most popular' },
  { value: 'price_low', label: 'Price: low to high' },
  { value: 'price_high', label: 'Price: high to low' },
  { value: 'rating', label: 'Best rated' },
  { value: 'newest', label: 'Newest' },
];

function PartCard({ part }: { part: SparePart }) {
  const { add, wishlist, toggleWishlist } = useCart();
  const { push } = useToast();
  const saved = wishlist.includes(part._id);
  const discount = part.mrp && part.mrp > part.price ? Math.round(((part.mrp - part.price) / part.mrp) * 100) : 0;

  return (
    <div className="card flex flex-col">
      <div className="flex items-start justify-between">
        <Link href={`/customer/store/${part._id}`} className="text-4xl">
          {part.image || '🔩'}
        </Link>
        <button
          onClick={() => toggleWishlist(part._id)}
          className="text-xl transition hover:scale-110"
          aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          {saved ? '❤️' : '🤍'}
        </button>
      </div>

      <Link href={`/customer/store/${part._id}`} className="mt-2 flex-1">
        <h3 className="line-clamp-2 font-bold leading-tight hover:text-brand-600 dark:hover:text-brand-400">{part.name}</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{part.brand}</p>
      </Link>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Stars value={part.ratingAverage} />
        <span>({part.ratingCount})</span>
        {part.warrantyMonths > 0 && <span>· {part.warrantyMonths} mo warranty</span>}
      </div>

      {part.reasons?.[0] && (
        <p className="mt-2 rounded-lg bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
          ✨ {part.reasons[0]}
        </p>
      )}

      <div className="mt-3 flex items-end justify-between">
        <div>
          <span className="text-lg font-bold">{rupees(part.price)}</span>
          {discount > 0 && (
            <>
              <span className="ml-1.5 text-xs text-slate-400 line-through">{rupees(part.mrp)}</span>
              <span className="ml-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{discount}% off</span>
            </>
          )}
        </div>
      </div>

      <p className={`mt-1 text-xs ${part.stock === 0 ? 'text-red-600' : part.stock <= 5 ? 'text-amber-600' : 'text-slate-500 dark:text-slate-400'}`}>
        {part.stock === 0 ? 'Out of stock' : part.stock <= 5 ? `Only ${part.stock} left` : 'In stock'}
      </p>

      <button
        onClick={() => {
          add(part);
          push(`${part.name} added to cart`, 'success');
        }}
        disabled={part.stock === 0}
        className="btn-primary mt-3 w-full text-sm"
      >
        Add to cart
      </button>
    </div>
  );
}

export default function StorePage() {
  const { user } = useAuth();
  const { wishlist } = useCart();
  const [parts, setParts] = useState<SparePart[]>([]);
  const [recommended, setRecommended] = useState<SparePart[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [model, setModel] = useState('');
  const [sort, setSort] = useState('popular');
  const [showWishlist, setShowWishlist] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<{ recommendations: SparePart[] }>('/parts/recommended?limit=4').catch(() => ({ recommendations: [] })),
      api<{ models: string[] }>('/parts/models'),
    ]).then(([r, m]) => {
      setRecommended(r.recommendations);
      setModels(m.models);
    });
  }, []);

  useEffect(() => {
    const id = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (category) params.set('category', category);
      if (model) params.set('model', model);
      params.set('sort', sort);
      const data = await api<{ parts: SparePart[]; categories: string[] }>(`/parts?${params}`);
      setParts(data.parts);
      setCategories(data.categories);
      setLoading(false);
    }, 250); // debounce so typing does not fire a request per keystroke
    return () => clearTimeout(id);
  }, [q, category, model, sort]);

  const myModels = useMemo(
    () => (user?.vehicles || []).map((v) => `${v.make} ${v.model}`),
    [user?.vehicles]
  );

  const visible = showWishlist ? parts.filter((p) => wishlist.includes(p._id)) : parts;

  return (
    <div className="space-y-6">
      <SectionTitle title="Spare parts store" subtitle="Genuine parts, filtered to fit your bike" />

      {recommended.length > 0 && !showWishlist && (
        <section className="rounded-2xl border border-brand-200 bg-brand-50/50 p-5 dark:border-brand-500/20 dark:bg-brand-500/5">
          <h2 className="font-bold">✨ Recommended for you</h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Based on your bike model, past services and what riders like you buy
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recommended.map((p) => (
              <PartCard key={p._id} part={p} />
            ))}
          </div>
        </section>
      )}

      <div className="card space-y-3">
        <div className="flex flex-wrap gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by part name, brand or bike model…"
            className="input flex-1 min-w-[220px]"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="input w-auto">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowWishlist((w) => !w)}
            className={`btn ${showWishlist ? 'btn-primary' : 'btn-secondary'} text-sm`}
          >
            ❤️ Wishlist ({wishlist.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={model} onChange={(e) => setModel(e.target.value)} className="input w-auto text-sm">
            <option value="">All bike models</option>
            {myModels.length > 0 && (
              <optgroup label="Your bikes">
                {myModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="All models">
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </optgroup>
          </select>

          <button
            onClick={() => setCategory('')}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
              category === '' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                category === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={showWishlist ? 'Your wishlist is empty' : 'No parts match that search'}
          hint={showWishlist ? 'Tap the heart on any part to save it here.' : 'Try a different keyword, model or category.'}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((p) => (
            <PartCard key={p._id} part={p} />
          ))}
        </div>
      )}
    </div>
  );
}
