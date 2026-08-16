'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, formatDateTime, rupees } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocketEvent } from '@/lib/socket';
import { useToast } from '@/components/Toast';
import MapView, { type MapMarker } from '@/components/MapView';
import { EmptyState, SectionTitle, Spinner } from '@/components/ui';
import type { Booking } from '@/lib/types';

export default function OpenJobsPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = async () => {
    const { bookings } = await api<{ bookings: Booking[] }>('/bookings/available');
    setJobs(bookings);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useSocketEvent<Booking>('booking:new', (job) => {
    push(`New ${job.kind === 'sos' ? 'emergency' : 'service'} request nearby`, 'info');
    load();
  });

  useSocketEvent<{ bookingId: string }>('booking:taken', ({ bookingId }) => {
    setJobs((current) => current.filter((j) => j._id !== bookingId));
  });

  const accept = async (id: string) => {
    setAccepting(id);
    try {
      await api(`/bookings/${id}/accept`, { method: 'POST', body: {} });
      push('Job accepted — the customer can now track you', 'success');
      setJobs((current) => current.filter((j) => j._id !== id));
    } catch (err: any) {
      push(err.message, 'error');
      load();
    } finally {
      setAccepting(null);
    }
  };

  if (loading) return <Spinner />;

  const markers: MapMarker[] = [
    ...(user?.location?.coordinates
      ? [{ id: 'me', position: [user.location.coordinates[1], user.location.coordinates[0]] as [number, number], kind: 'mechanic' as const, label: 'You' }]
      : []),
    ...jobs.map((j) => ({
      id: j._id,
      position: [j.pickupLocation.coordinates[1], j.pickupLocation.coordinates[0]] as [number, number],
      kind: 'customer' as const,
      label: j.customer?.name || 'Customer',
      sublabel: `${j.serviceType?.name} · ${j.distanceFromMeKm} km`,
    })),
  ];

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Open job requests"
        subtitle={`Unassigned jobs within your ${user?.mechanicProfile?.serviceRadiusKm || 15} km service radius`}
      />

      {jobs.length === 0 ? (
        <EmptyState
          icon="📭"
          title="No open requests right now"
          hint="New requests appear here instantly. Make sure you are online so customers can find you."
          action={
            <Link href="/mechanic" className="btn-primary">
              Back to dashboard
            </Link>
          }
        />
      ) : (
        <>
          <MapView
            markers={markers}
            height={300}
            radiusCenter={markers[0]?.position}
            radiusKm={user?.mechanicProfile?.serviceRadiusKm || 15}
          />

          <div className="grid gap-3 md:grid-cols-2">
            {jobs.map((job) => (
              <div key={job._id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{job.serviceType?.icon}</span>
                      <div>
                        <h3 className="font-bold leading-tight">{job.serviceType?.name}</h3>
                        <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{job.reference}</p>
                      </div>
                    </div>
                  </div>
                  {job.kind === 'sos' && (
                    <span className="badge bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">🚨 Emergency</span>
                  )}
                </div>

                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">Customer</dt>
                    <dd className="font-medium">{job.customer?.name}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">Vehicle</dt>
                    <dd className="text-right font-medium">
                      {job.vehicle.make} {job.vehicle.model}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">Distance</dt>
                    <dd className="font-bold text-brand-600 dark:text-brand-400">
                      {job.distanceFromMeKm} km · {job.etaFromMeMinutes} min ride
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">Requested</dt>
                    <dd className="font-medium">{formatDateTime(job.createdAt)}</dd>
                  </div>
                  {job.scheduledFor && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500 dark:text-slate-400">Scheduled for</dt>
                      <dd className="font-medium">{formatDateTime(job.scheduledFor)}</dd>
                    </div>
                  )}
                </dl>

                {job.description && (
                  <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                    "{job.description}"
                  </p>
                )}

                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">📍 {job.pickupLocation.address || 'Location shared on accept'}</p>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">You earn</p>
                    <p className="text-lg font-bold">{rupees(job.charges.labour + job.charges.visitFee)}</p>
                  </div>
                  <button onClick={() => accept(job._id)} disabled={accepting === job._id} className="btn-primary">
                    {accepting === job._id ? 'Accepting…' : 'Accept job'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
