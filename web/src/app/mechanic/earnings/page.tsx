'use client';

import { useEffect, useState } from 'react';
import { api, formatDateTime, rupees } from '@/lib/api';
import { BarChart, SectionTitle, Spinner, StatCard, StatusBadge } from '@/components/ui';

interface Earnings {
  today: number;
  week: number;
  month: number;
  lifetime: number;
  unpaidAmount: number;
  jobCount: number;
  byDay: { date: string; amount: number }[];
  recent: { reference: string; amount: number; completedAt: string; paymentStatus: string }[];
}

export default function EarningsPage() {
  const [data, setData] = useState<Earnings | null>(null);

  useEffect(() => {
    api<Earnings>('/mechanic/earnings').then(setData);
  }, []);

  if (!data) return <Spinner />;

  return (
    <div className="space-y-6">
      <SectionTitle title="Earnings" subtitle="Labour and visit fees from completed jobs" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today" value={rupees(data.today)} icon="📅" tone="success" />
        <StatCard label="This week" value={rupees(data.week)} icon="🗓️" />
        <StatCard label="This month" value={rupees(data.month)} icon="📆" />
        <StatCard label="Lifetime" value={rupees(data.lifetime)} icon="🏆" hint={`${data.jobCount} jobs completed`} />
      </div>

      {data.unpaidAmount > 0 && (
        <div className="card border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            {rupees(data.unpaidAmount)} is awaiting customer payment
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            This settles automatically once the customer completes payment in their app.
          </p>
        </div>
      )}

      <div className="card">
        <h3 className="mb-4 font-bold">Last 14 days</h3>
        <BarChart data={data.byDay.map((d) => ({ label: d.date.slice(5), value: d.amount }))} height={170} />
      </div>

      <div className="card">
        <h3 className="mb-4 font-bold">Recent completed jobs</h3>
        {data.recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No completed jobs yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="pb-2">Reference</th>
                  <th className="pb-2">Completed</th>
                  <th className="pb-2">Payment</th>
                  <th className="pb-2 text-right">You earned</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.reference} className="border-b border-slate-50 dark:border-slate-800/60">
                    <td className="py-2.5 font-mono text-xs">{r.reference}</td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-400">{formatDateTime(r.completedAt)}</td>
                    <td className="py-2.5">
                      <StatusBadge status={r.paymentStatus} />
                    </td>
                    <td className="py-2.5 text-right font-semibold">{rupees(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
