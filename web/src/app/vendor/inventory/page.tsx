'use client';

import { useEffect, useState } from 'react';
import { api, rupees } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { SectionTitle, Spinner, StatCard } from '@/components/ui';
import type { SparePart } from '@/lib/types';

export default function InventoryPage() {
  const { push } = useToast();
  const [products, setProducts] = useState<SparePart[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [restocking, setRestocking] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  const load = async () => {
    const data = await api<{ products: SparePart[]; summary: any }>('/vendor/inventory');
    setProducts(data.products);
    setSummary(data.summary);
  };

  useEffect(() => {
    load();
  }, []);

  const restock = async (product: SparePart) => {
    const add = Number(amount);
    if (!add || add < 1) return;
    await api(`/vendor/products/${product._id}`, { method: 'PATCH', body: { stock: product.stock + add } });
    push(`Added ${add} units of ${product.name}`, 'success');
    setRestocking(null);
    setAmount('');
    load();
  };

  if (!summary) return <Spinner />;

  return (
    <div className="space-y-6">
      <SectionTitle title="Inventory" subtitle="Stock levels across every product you list" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Products" value={summary.skuCount} icon="🔩" />
        <StatCard label="Inventory value" value={rupees(summary.inventoryValue)} icon="🏷️" />
        <StatCard label="Low stock" value={summary.lowStockCount} icon="⚠️" tone={summary.lowStockCount ? 'warn' : 'default'} />
        <StatCard label="Out of stock" value={summary.outOfStock} icon="🚫" tone={summary.outOfStock ? 'danger' : 'default'} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="pb-3">Product</th>
              <th className="pb-3">Category</th>
              <th className="pb-3 text-right">Price</th>
              <th className="pb-3 text-center">Stock</th>
              <th className="pb-3 text-center">Alert at</th>
              <th className="pb-3 text-right">Value</th>
              <th className="pb-3 text-right">Restock</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const low = p.stock <= p.lowStockThreshold;
              return (
                <tr key={p._id} className={`border-b border-slate-50 dark:border-slate-800/60 ${low ? 'bg-amber-50/60 dark:bg-amber-500/5' : ''}`}>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{p.image || '🔩'}</span>
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{p.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-slate-600 dark:text-slate-400">{p.category}</td>
                  <td className="py-3 text-right">{rupees(p.price)}</td>
                  <td className="py-3 text-center">
                    <span className={`font-bold ${p.stock === 0 ? 'text-red-600' : low ? 'text-amber-600' : ''}`}>{p.stock}</span>
                  </td>
                  <td className="py-3 text-center text-slate-500 dark:text-slate-400">{p.lowStockThreshold}</td>
                  <td className="py-3 text-right">{rupees(p.price * p.stock)}</td>
                  <td className="py-3 text-right">
                    {restocking === p._id ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          autoFocus
                          type="number"
                          min={1}
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && restock(p)}
                          className="input w-20 px-2 py-1 text-sm"
                          placeholder="Qty"
                        />
                        <button onClick={() => restock(p)} className="btn-primary px-2 py-1 text-xs">
                          Add
                        </button>
                        <button onClick={() => setRestocking(null)} className="btn-ghost px-2 py-1 text-xs">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setRestocking(p._id)} className="btn-secondary px-2.5 py-1 text-xs">
                        + Stock
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
