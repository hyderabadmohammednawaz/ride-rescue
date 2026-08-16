'use client';

import { useEffect, useState } from 'react';
import { api, rupees } from '@/lib/api';
import { ProgressRow, SectionTitle, Spinner, Stars } from '@/components/ui';

interface Reports {
  byService: { _id: string; name?: string; icon?: string; jobs: number; revenue: number }[];
  byMechanic: { _id: string; name: string; rating?: number; jobs: number; revenue: number }[];
  byStatus: { _id: string; count: number }[];
  topCustomers: { _id: string; name: string; email: string; bookings: number; spend: number }[];
}

const STATUS_COLOUR: Record<string, string> = {
  pending: 'bg-amber-500',
  accepted: 'bg-blue-500',
  arrived: 'bg-indigo-500',
  in_progress: 'bg-violet-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-slate-400',
};

export default function ReportsPage() {
  const [data, setData] = useState<Reports | null>(null);

  useEffect(() => {
    api<Reports>('/admin/reports').then(setData);
  }, []);

  if (!data) return <Spinner />;

  const totalStatus = data.byStatus.reduce((s, x) => s + x.count, 0) || 1;
  const maxServiceRevenue = Math.max(1, ...data.byService.map((s) => s.revenue));

  const exportCsv = () => {
    const rows = [
      ['Report', 'Name', 'Jobs/Bookings', 'Revenue/Spend'],
      ...data.byService.map((s) => ['Service', s.name || '—', String(s.jobs), String(s.revenue)]),
      ...data.byMechanic.map((m) => ['Mechanic', m.name, String(m.jobs), String(m.revenue)]),
      ...data.topCustomers.map((c) => ['Customer', c.name, String(c.bookings), String(c.spend)]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `riderescue-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Reports"
        subtitle="Revenue, service mix, mechanic performance and customer value"
        action={
          <button onClick={exportCsv} className="btn-secondary text-sm">
            ⬇️ Export CSV
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 font-bold">Revenue by service type</h3>
          {data.byService.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No completed services yet</p>
          ) : (
            data.byService.map((s) => (
              <ProgressRow
                key={s._id}
                label={`${s.icon || '🔧'} ${s.name || 'Service'} (${s.jobs} jobs)`}
                value={s.revenue}
                max={maxServiceRevenue}
                suffix=" ₹"
              />
            ))
          )}
        </div>

        <div className="card">
          <h3 className="mb-4 font-bold">Booking status distribution</h3>
          <div className="mb-4 flex h-3 overflow-hidden rounded-full">
            {data.byStatus.map((s) => (
              <div
                key={s._id}
                className={STATUS_COLOUR[s._id] || 'bg-slate-300'}
                style={{ width: `${(s.count / totalStatus) * 100}%` }}
                title={`${s._id}: ${s.count}`}
              />
            ))}
          </div>
          <div className="space-y-2">
            {data.byStatus.map((s) => (
              <div key={s._id} className="flex items-center gap-2 text-sm">
                <span className={`h-3 w-3 rounded-full ${STATUS_COLOUR[s._id] || 'bg-slate-300'}`} />
                <span className="flex-1 capitalize">{s._id.replace(/_/g, ' ')}</span>
                <span className="font-semibold">{s.count}</span>
                <span className="w-12 text-right text-xs text-slate-500 dark:text-slate-400">
                  {((s.count / totalStatus) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="mb-4 font-bold">Mechanic performance</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="pb-2">Rank</th>
              <th className="pb-2">Mechanic</th>
              <th className="pb-2">Rating</th>
              <th className="pb-2 text-right">Jobs completed</th>
              <th className="pb-2 text-right">Revenue generated</th>
            </tr>
          </thead>
          <tbody>
            {data.byMechanic.map((m, i) => (
              <tr key={m._id} className="border-b border-slate-50 dark:border-slate-800/60">
                <td className="py-2.5 font-bold text-slate-400">#{i + 1}</td>
                <td className="py-2.5 font-medium">{m.name}</td>
                <td className="py-2.5">
                  <Stars value={m.rating || 0} />
                </td>
                <td className="py-2.5 text-right">{m.jobs}</td>
                <td className="py-2.5 text-right font-semibold">{rupees(m.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.byMechanic.length === 0 && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No completed jobs yet</p>}
      </div>

      <div className="card overflow-x-auto">
        <h3 className="mb-4 font-bold">Top customers by spend</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="pb-2">Customer</th>
              <th className="pb-2">Email</th>
              <th className="pb-2 text-right">Bookings</th>
              <th className="pb-2 text-right">Total spend</th>
            </tr>
          </thead>
          <tbody>
            {data.topCustomers.map((c) => (
              <tr key={c._id} className="border-b border-slate-50 dark:border-slate-800/60">
                <td className="py-2.5 font-medium">{c.name}</td>
                <td className="py-2.5 text-slate-600 dark:text-slate-400">{c.email}</td>
                <td className="py-2.5 text-right">{c.bookings}</td>
                <td className="py-2.5 text-right font-semibold">{rupees(c.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
