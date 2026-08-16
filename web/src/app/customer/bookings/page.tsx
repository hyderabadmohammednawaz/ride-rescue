'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, formatDateTime, rupees } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { EmptyState, SectionTitle, Spinner, StatusBadge } from '@/components/ui';
import type { Booking } from '@/lib/types';

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'pending,accepted,arrived,in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async (status: string) => {
    setLoading(true);
    const { bookings } = await api<{ bookings: Booking[] }>(`/bookings${status ? `?status=${status}` : ''}`);
    setBookings(bookings);
    setLoading(false);
  };

  useEffect(() => {
    load(filter);
  }, [filter]);

  useSocketEvent<Booking>('booking:updated', (updated) => {
    setBookings((current) => current.map((b) => (b._id === updated._id ? updated : b)));
  });

  return (
    <div>
      <SectionTitle
        title="My bookings"
        subtitle="Every service you have requested, past and present"
        action={
          <Link href="/customer/book" className="btn-primary text-sm">
            + New booking
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilter(f.value)}
            className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
              filter === f.value
                ? 'bg-brand-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon="🔧"
          title="No bookings here yet"
          hint="Book a doorstep service or raise an SOS if your bike has broken down."
          action={
            <Link href="/customer/book" className="btn-primary">
              Book a service
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <Link key={b._id} href={`/customer/bookings/${b._id}`} className="card flex flex-wrap items-center gap-4 transition hover:border-brand-400 hover:shadow-md">
              <span className="text-3xl">{b.serviceType?.icon || '🔧'}</span>

              <div className="min-w-[180px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">{b.serviceType?.name || 'Service'}</h3>
                  {b.kind === 'sos' && (
                    <span className="badge bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">🚨 SOS</span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                  {b.vehicle.make} {b.vehicle.model} · <span className="font-mono text-xs">{b.reference}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(b.createdAt)}</p>
              </div>

              {b.mechanic && (
                <div className="hidden text-sm sm:block">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Mechanic</p>
                  <p className="font-medium">{b.mechanic.name}</p>
                </div>
              )}

              <div className="text-right">
                <p className="font-bold">{rupees(b.charges.total)}</p>
                <div className="mt-1 flex justify-end gap-1.5">
                  <StatusBadge status={b.status} />
                  {b.status === 'completed' && <StatusBadge status={b.paymentStatus} />}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
