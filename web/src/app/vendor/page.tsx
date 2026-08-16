'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, rupees } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocketEvent } from '@/lib/socket';
import { useToast } from '@/components/Toast';
import { BarChart, ProgressRow, SectionTitle, Spinner, StatCard } from '@/components/ui';

interface Sales {
  revenue: number;
  unitsSold: number;
  orderCount: number;
  today: number;
  week: number;
  month: number;
  pendingDispatch: number;
  bestSellers: { sku: string; name: string; units: number; revenue: number }[];
  revenueByDay: { date: string; amount: number }[];
}

interface Inventory {
  lowStock: any[];
  summary: { skuCount: number; outOfStock: number; lowStockCount: number; inventoryValue: number };
}

export default function VendorDashboard() {
  const { user } = useAuth();
  const { push } = useToast();
  const [sales, setSales] = useState<Sales | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);

  const load = () =>
    Promise.all([api<Sales>('/vendor/sales'), api<Inventory>('/vendor/inventory')]).then(([s, i]) => {
      setSales(s);
      setInventory(i);
    });

  useEffect(() => {
    load();
  }, []);

  useSocketEvent('order:new', () => {
    push('New order received', 'success');
    load();
  });

  if (!sales || !inventory) return <Spinner />;

  const maxUnits = Math.max(1, ...sales.bestSellers.map((b) => b.units));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{user?.vendorProfile?.shopName || user?.name}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {user?.vendorProfile?.address || 'Spare parts vendor'} · GST {user?.vendorProfile?.gstNumber || '—'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total revenue" value={rupees(sales.revenue)} icon="💰" tone="success" hint={`${sales.orderCount} orders`} />
        <StatCard label="This month" value={rupees(sales.month)} icon="📆" hint={`This week ${rupees(sales.week)}`} />
        <StatCard label="Units sold" value={sales.unitsSold} icon="📦" />
        <StatCard
          label="Awaiting dispatch"
          value={sales.pendingDispatch}
          icon="🚚"
          tone={sales.pendingDispatch > 0 ? 'warn' : 'default'}
        />
      </div>

      {inventory.lowStock.length > 0 && (
        <div className="card border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-amber-900 dark:text-amber-200">
                ⚠️ {inventory.lowStock.length} product(s) running low
              </h3>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                {inventory.lowStock
                  .slice(0, 3)
                  .map((p) => `${p.name} (${p.stock})`)
                  .join(', ')}
                {inventory.lowStock.length > 3 && ` and ${inventory.lowStock.length - 3} more`}
              </p>
            </div>
            <Link href="/vendor/inventory" className="btn-secondary text-sm">
              Restock now
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <SectionTitle title="Revenue trend" subtitle="Last 14 days" />
          <BarChart data={sales.revenueByDay.map((d) => ({ label: d.date.slice(5), value: d.amount }))} height={180} />
        </div>

        <div className="card">
          <SectionTitle title="Best sellers" subtitle="By units sold" />
          {sales.bestSellers.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No sales recorded yet</p>
          ) : (
            <div>
              {sales.bestSellers.map((b) => (
                <ProgressRow key={b.sku} label={b.name} value={b.units} max={maxUnits} suffix=" units" />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Products listed" value={inventory.summary.skuCount} icon="🔩" />
        <StatCard label="Inventory value" value={rupees(inventory.summary.inventoryValue)} icon="🏷️" />
        <StatCard label="Low stock" value={inventory.summary.lowStockCount} icon="⚠️" tone={inventory.summary.lowStockCount ? 'warn' : 'default'} />
        <StatCard label="Out of stock" value={inventory.summary.outOfStock} icon="🚫" tone={inventory.summary.outOfStock ? 'danger' : 'default'} />
      </div>
    </div>
  );
}
