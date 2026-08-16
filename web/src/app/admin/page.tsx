'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, rupees } from '@/lib/api';
import { BarChart, ProgressRow, SectionTitle, Spinner, StatCard } from '@/components/ui';

interface Dashboard {
  users: { customers: number; mechanics: number; activeMechanics: number; vendors: number; total: number };
  bookings: { total: number; active: number; completed: number; sosCount: number };
  revenue: { service: number; parts: number; total: number; collected: number; methodSplit: Record<string, number>; byDay: { date: string; amount: number }[] };
  orders: { total: number; pending: number };
  alerts: { openComplaints: number; lowStockProducts: number };
}

const METHOD_LABEL: Record<string, string> = { upi: '📲 UPI', card: '💳 Card', wallet: '👛 Wallet', cash: '💵 Cash' };

export default function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    api<Dashboard>('/admin/dashboard').then(setData);
  }, []);

  if (!data) return <Spinner />;

  const maxMethod = Math.max(1, ...Object.values(data.revenue.methodSplit));

  return (
    <div className="space-y-6">
      <SectionTitle title="Platform overview" subtitle="Live figures across customers, mechanics, vendors and revenue" />

      {(data.alerts.openComplaints > 0 || data.alerts.lowStockProducts > 0) && (
        <div className="flex flex-wrap gap-3">
          {data.alerts.openComplaints > 0 && (
            <Link
              href="/admin/complaints"
              className="flex-1 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 transition hover:border-red-400 dark:border-red-500/30 dark:bg-red-500/10"
            >
              <p className="font-bold text-red-900 dark:text-red-200">⚠️ {data.alerts.openComplaints} unresolved complaint(s)</p>
              <p className="mt-0.5 text-sm text-red-800 dark:text-red-300">Review and resolve them to keep ratings healthy.</p>
            </Link>
          )}
          {data.alerts.lowStockProducts > 0 && (
            <div className="flex-1 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="font-bold text-amber-900 dark:text-amber-200">📦 {data.alerts.lowStockProducts} product(s) low on stock</p>
              <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-300">Vendors have been notified automatically.</p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={data.users.total} icon="👥" hint={`${data.users.customers} customers`} />
        <StatCard
          label="Active mechanics"
          value={data.users.activeMechanics}
          icon="🔧"
          tone="success"
          hint={`of ${data.users.mechanics} registered`}
        />
        <StatCard label="Vendors" value={data.users.vendors} icon="🏪" />
        <StatCard label="Total revenue" value={rupees(data.revenue.total)} icon="💰" tone="success" hint={`${rupees(data.revenue.collected)} collected`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total bookings" value={data.bookings.total} icon="📋" />
        <StatCard label="Active right now" value={data.bookings.active} icon="⚡" tone={data.bookings.active ? 'warn' : 'default'} />
        <StatCard label="Emergency (SOS) jobs" value={data.bookings.sosCount} icon="🚨" tone="danger" />
        <StatCard label="Parts orders" value={data.orders.total} icon="📦" hint={`${data.orders.pending} awaiting dispatch`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="card">
          <SectionTitle title="Revenue collected" subtitle="Last 30 days" />
          <BarChart data={data.revenue.byDay.map((d) => ({ label: d.date.slice(5), value: d.amount }))} height={200} />
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-3 font-bold">Revenue split</h3>
            <ProgressRow label="🔧 Services" value={data.revenue.service} max={Math.max(data.revenue.service, data.revenue.parts)} suffix=" ₹" />
            <ProgressRow label="🔩 Spare parts" value={data.revenue.parts} max={Math.max(data.revenue.service, data.revenue.parts)} suffix=" ₹" />
          </div>

          <div className="card">
            <h3 className="mb-3 font-bold">Payment methods</h3>
            {Object.keys(data.revenue.methodSplit).length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">No payments recorded yet</p>
            ) : (
              Object.entries(data.revenue.methodSplit).map(([method, amount]) => (
                <ProgressRow key={method} label={METHOD_LABEL[method] || method} value={amount} max={maxMethod} suffix=" ₹" />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/users" className="card text-center transition hover:border-brand-400">
          <span className="text-3xl">👥</span>
          <p className="mt-2 font-semibold">Manage users</p>
        </Link>
        <Link href="/admin/bookings" className="card text-center transition hover:border-brand-400">
          <span className="text-3xl">🔧</span>
          <p className="mt-2 font-semibold">Bookings & assignment</p>
        </Link>
        <Link href="/admin/reports" className="card text-center transition hover:border-brand-400">
          <span className="text-3xl">📈</span>
          <p className="mt-2 font-semibold">Reports</p>
        </Link>
        <Link href="/admin/complaints" className="card text-center transition hover:border-brand-400">
          <span className="text-3xl">⚠️</span>
          <p className="mt-2 font-semibold">Complaints</p>
        </Link>
      </div>
    </div>
  );
}
