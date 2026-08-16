'use client';

import type { ReactNode } from 'react';
import type { BookingStatus } from '@/lib/types';

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: string;
  tone?: 'default' | 'success' | 'warn' | 'danger';
}) {
  const tones = {
    default: 'text-slate-900 dark:text-white',
    success: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
  };
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  accepted: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  arrived: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300',
  in_progress: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  cancelled: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  placed: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  dispatched: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  unpaid: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  open: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  in_review: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
};

export function StatusBadge({ status }: { status: BookingStatus | string }) {
  return (
    <span className={`badge ${STATUS_STYLES[status] || STATUS_STYLES.cancelled}`}>
      {String(status).replace(/_/g, ' ')}
    </span>
  );
}

export function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const full = Math.round(value);
  return (
    <span className={`inline-flex items-center gap-0.5 ${size === 'lg' ? 'text-lg' : 'text-xs'}`} title={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= full ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600'}>
          ★
        </span>
      ))}
    </span>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center py-14 text-center">
      <span className="text-5xl">{icon}</span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-14 text-sm text-slate-500 dark:text-slate-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600 dark:border-slate-700 dark:border-t-brand-400" />
      {label}
    </div>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Small inline bar chart - avoids pulling in a charting library. */
export function BarChart({ data, height = 140 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No data yet</p>;
  }
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="group flex min-w-[24px] flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] font-semibold text-slate-500 opacity-0 transition group-hover:opacity-100 dark:text-slate-400">
            {d.value.toLocaleString('en-IN')}
          </span>
          <div
            className="w-full rounded-t bg-brand-500 transition group-hover:bg-brand-600 dark:bg-brand-500/70"
            style={{ height: `${Math.max(3, (d.value / max) * (height - 34))}px` }}
          />
          <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal proportional bar, used for revenue splits and rankings. */
export function ProgressRow({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-sm">
        <span className="truncate font-medium">{label}</span>
        <span className="ml-3 shrink-0 tabular-nums text-slate-600 dark:text-slate-400">
          {value.toLocaleString('en-IN')}
          {suffix}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }} />
      </div>
    </div>
  );
}
