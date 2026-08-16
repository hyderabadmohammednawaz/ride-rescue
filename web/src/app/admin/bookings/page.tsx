'use client';

import { useEffect, useState } from 'react';
import { api, formatDateTime, rupees } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { SectionTitle, Spinner, StatusBadge, Stars } from '@/components/ui';
import type { Booking } from '@/lib/types';

interface Candidate {
  _id: string;
  name: string;
  phone: string;
  rating: number;
  experienceYears: number;
  distanceKm: number;
  etaMinutes: number;
  activeJobs: number;
  matchScore: number;
  reasons: string[];
}

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Unassigned', value: 'pending' },
  { label: 'Active', value: 'accepted,arrived,in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

export default function AdminBookingsPage() {
  const { push } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const load = async () => {
    setLoading(true);
    const { bookings } = await api<{ bookings: Booking[] }>(`/admin/bookings${filter ? `?status=${filter}` : ''}`);
    setBookings(bookings);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAssign = async (booking: Booking) => {
    setAssigning(booking._id);
    setLoadingCandidates(true);
    try {
      const { candidates } = await api<{ candidates: Candidate[] }>(`/admin/bookings/${booking._id}/candidates`);
      setCandidates(candidates);
    } catch (err: any) {
      push(err.message, 'error');
    } finally {
      setLoadingCandidates(false);
    }
  };

  const assign = async (bookingId: string, mechanicId: string, name: string) => {
    try {
      await api(`/admin/bookings/${bookingId}/assign`, { method: 'POST', body: { mechanicId } });
      push(`Assigned to ${name}`, 'success');
      setAssigning(null);
      load();
    } catch (err: any) {
      push(err.message, 'error');
    }
  };

  return (
    <div>
      <SectionTitle title="Booking management" subtitle="Monitor every job and assign mechanics manually when needed" />

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
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div key={b._id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{b.serviceType?.icon || '🔧'}</span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{b.serviceType?.name}</h3>
                      {b.kind === 'sos' && (
                        <span className="badge bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">🚨 SOS</span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{b.reference}</p>
                    <p className="mt-1 text-sm">
                      <span className="text-slate-500 dark:text-slate-400">Customer:</span> {b.customer?.name} ({b.customer?.phone})
                    </p>
                    <p className="text-sm">
                      <span className="text-slate-500 dark:text-slate-400">Mechanic:</span>{' '}
                      {b.mechanic ? `${b.mechanic.name} (${b.mechanic.phone})` : <em className="text-amber-600 dark:text-amber-400">Not assigned</em>}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {b.vehicle.make} {b.vehicle.model} · {formatDateTime(b.createdAt)} · 📍{' '}
                      {b.pickupLocation.address || 'Location shared'}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-bold">{rupees(b.charges.total)}</p>
                  <div className="mt-1 flex justify-end gap-1.5">
                    <StatusBadge status={b.status} />
                    <StatusBadge status={b.paymentStatus} />
                  </div>
                  {!['completed', 'cancelled'].includes(b.status) && (
                    <button onClick={() => openAssign(b)} className="btn-secondary mt-2 text-xs">
                      {b.mechanic ? 'Reassign' : 'Assign mechanic'}
                    </button>
                  )}
                </div>
              </div>

              {assigning === b._id && (
                <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-semibold">AI-ranked candidates</h4>
                    <button onClick={() => setAssigning(null)} className="btn-ghost px-2 py-1 text-xs">
                      ✕ Close
                    </button>
                  </div>

                  {loadingCandidates ? (
                    <Spinner label="Scoring nearby mechanics…" />
                  ) : candidates.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                      No available mechanics within 30 km.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {candidates.map((c, i) => (
                        <div key={c._id} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
                          <span className="w-6 text-center text-sm font-bold text-slate-400">#{i + 1}</span>
                          <div className="min-w-[140px] flex-1">
                            <p className="font-semibold">{c.name}</p>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <Stars value={c.rating} />
                              <span>· {c.experienceYears} yrs · {c.activeJobs} active</span>
                            </div>
                          </div>
                          <div className="text-sm">
                            <p className="font-semibold">{c.distanceKm} km</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">ETA {c.etaMinutes} min</p>
                          </div>
                          <div className="text-sm">
                            <p className="font-semibold text-brand-600 dark:text-brand-400">{(c.matchScore * 100).toFixed(0)}%</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">match</p>
                          </div>
                          <button onClick={() => assign(b._id, c._id, c.name)} className="btn-primary px-3 py-1.5 text-xs">
                            Assign
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {bookings.length === 0 && (
            <p className="card py-10 text-center text-sm text-slate-500 dark:text-slate-400">No bookings match this filter</p>
          )}
        </div>
      )}
    </div>
  );
}
