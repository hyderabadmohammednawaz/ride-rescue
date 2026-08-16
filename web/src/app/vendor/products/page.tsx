'use client';

import { useEffect, useState } from 'react';
import { api, rupees } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { EmptyState, SectionTitle, Spinner } from '@/components/ui';
import type { SparePart } from '@/lib/types';

const CATEGORIES = ['Engine', 'Brakes', 'Electrical', 'Tyres', 'Body', 'Lubricants', 'Accessories', 'Filters'];

const BLANK = {
  name: '',
  brand: '',
  sku: '',
  category: 'Engine',
  description: '',
  price: '',
  mrp: '',
  stock: '',
  lowStockThreshold: '5',
  warrantyMonths: '0',
  compatibleModels: '',
  image: '🔩',
};

function ProductForm({ product, onDone }: { product?: SparePart; onDone: (saved: boolean) => void }) {
  const { push } = useToast();
  const [form, setForm] = useState(
    product
      ? {
          name: product.name,
          brand: product.brand || '',
          sku: product.sku,
          category: product.category,
          description: product.description || '',
          price: String(product.price),
          mrp: String(product.mrp || ''),
          stock: String(product.stock),
          lowStockThreshold: String(product.lowStockThreshold),
          warrantyMonths: String(product.warrantyMonths),
          compatibleModels: product.compatibleModels.join(', '),
          image: product.image || '🔩',
        }
      : BLANK
  );
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        ...form,
        price: Number(form.price),
        mrp: form.mrp ? Number(form.mrp) : undefined,
        stock: Number(form.stock) || 0,
        lowStockThreshold: Number(form.lowStockThreshold) || 5,
        warrantyMonths: Number(form.warrantyMonths) || 0,
      };
      if (product) await api(`/vendor/products/${product._id}`, { method: 'PATCH', body });
      else await api('/vendor/products', { method: 'POST', body });

      push(product ? 'Product updated' : 'Product added to the store', 'success');
      onDone(true);
    } catch (err: any) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h3 className="font-bold">{product ? 'Edit product' : 'Add a new product'}</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Product name</label>
          <input required value={form.name} onChange={set('name')} className="input" placeholder="Front Brake Pad Set" />
        </div>
        <div>
          <label className="label">Brand</label>
          <input value={form.brand} onChange={set('brand')} className="input" placeholder="Brembo" />
        </div>
        <div>
          <label className="label">SKU</label>
          <input required disabled={!!product} value={form.sku} onChange={set('sku')} className="input disabled:opacity-60" placeholder="RR-BRA-0105" />
        </div>
        <div>
          <label className="label">Category</label>
          <select value={form.category} onChange={set('category')} className="input">
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Icon</label>
          <input value={form.image} onChange={set('image')} className="input" placeholder="🔩" maxLength={4} />
        </div>
        <div>
          <label className="label">Selling price (₹)</label>
          <input required type="number" min={0} value={form.price} onChange={set('price')} className="input" />
        </div>
        <div>
          <label className="label">MRP (₹)</label>
          <input type="number" min={0} value={form.mrp} onChange={set('mrp')} className="input" />
        </div>
        <div>
          <label className="label">Stock quantity</label>
          <input type="number" min={0} value={form.stock} onChange={set('stock')} className="input" />
        </div>
        <div>
          <label className="label">Low stock alert at</label>
          <input type="number" min={0} value={form.lowStockThreshold} onChange={set('lowStockThreshold')} className="input" />
        </div>
        <div>
          <label className="label">Warranty (months)</label>
          <input type="number" min={0} value={form.warrantyMonths} onChange={set('warrantyMonths')} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Compatible bike models</label>
          <input
            value={form.compatibleModels}
            onChange={set('compatibleModels')}
            className="input"
            placeholder="Honda Activa 6G, Hero Splendor Plus, TVS Jupiter"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Comma separated. This drives the "fits your bike" filter and the AI recommendations.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <textarea value={form.description} onChange={set('description')} rows={2} className="input" />
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? 'Saving…' : product ? 'Save changes' : 'Add product'}
        </button>
        <button type="button" onClick={() => onDone(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function VendorProductsPage() {
  const { push } = useToast();
  const [products, setProducts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = async () => {
    const { products } = await api<{ products: SparePart[] }>('/vendor/products');
    setProducts(products);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (product: SparePart) => {
    if (!window.confirm(`Remove "${product.name}" from the store? Past orders keep their record.`)) return;
    await api(`/vendor/products/${product._id}`, { method: 'DELETE' });
    push('Product removed from the store', 'info');
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Products"
        subtitle="Everything you sell on the RideRescue marketplace"
        action={
          !adding && (
            <button onClick={() => setAdding(true)} className="btn-primary text-sm">
              + Add product
            </button>
          )
        }
      />

      {adding && (
        <ProductForm
          onDone={(saved) => {
            setAdding(false);
            if (saved) load();
          }}
        />
      )}

      {products.length === 0 && !adding ? (
        <EmptyState
          icon="🔩"
          title="No products listed yet"
          hint="Add your first spare part so customers can find and order it."
          action={
            <button onClick={() => setAdding(true)} className="btn-primary">
              Add a product
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {products.map((p) =>
            editing === p._id ? (
              <ProductForm
                key={p._id}
                product={p}
                onDone={(saved) => {
                  setEditing(null);
                  if (saved) load();
                }}
              />
            ) : (
              <div key={p._id} className={`card flex flex-wrap items-center gap-4 ${p.active ? '' : 'opacity-60'}`}>
                <span className="text-3xl">{p.image || '🔩'}</span>

                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{p.name}</h3>
                    {!p.active && <span className="badge bg-slate-200 text-slate-600 dark:bg-slate-700">Removed</span>}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {p.brand} · {p.category} · <span className="font-mono text-xs">{p.sku}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Fits {p.compatibleModels.slice(0, 3).join(', ')}
                    {p.compatibleModels.length > 3 && ` +${p.compatibleModels.length - 3}`}
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Price</p>
                  <p className="font-bold">{rupees(p.price)}</p>
                </div>

                <div className="text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Stock</p>
                  <p className={`font-bold ${p.stock === 0 ? 'text-red-600' : p.stock <= p.lowStockThreshold ? 'text-amber-600' : ''}`}>
                    {p.stock}
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Sold</p>
                  <p className="font-bold">{p.unitsSold}</p>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setEditing(p._id)} className="btn-secondary text-xs">
                    Edit
                  </button>
                  {p.active && (
                    <button onClick={() => remove(p)} className="btn-secondary text-xs text-red-600 dark:text-red-400">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
