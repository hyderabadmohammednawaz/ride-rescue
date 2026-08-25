'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, rupees } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocket, useSocketEvent } from '@/lib/socket';
import { useToast } from '@/components/Toast';
import { SectionTitle, Spinner, StatCard, StatusBadge } from '@/components/ui';
import type { Booking } from '@/lib/types';

interface Dashboard {
  isAvailable: boolean;
  activeJobs: Booking[];
  stats: {
    todayJobs: number;
    openRequests: number;
    completedToday: number;
    todayEarnings: number;
    rating: number;
    ratingCount: number;
    totalCompleted: number;
  };
}

export default function MechanicDashboard() {
  const { user, setUser } = useAuth();
  const { socket } = useSocket();
  const { push } = useToast();
  const [data, setData] = useState<Dashboard | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = () => api<Dashboard>('/mechanic/dashboard').then(setData);

  useEffect(() => {
    load();
  }, []);

  useSocketEvent<Booking>('booking:assigned', (booking) => {
    push(`New job: ${booking.serviceType?.name} — ${booking.distanceKm} km away`, 'success');
    load();
  });

  useSocketEvent<Booking>('booking:new', () => load());
  useSocketEvent<Booking>('booking:updated', () => load());

  /**
   * Streams the browser's GPS to the server so the customer's tracking map
   * follows the real device. Without this the demo simulator moves the pin.
   */
  useEffect(() => {
    if (!sharing || !socket || !navigator.geolocation) return;

    const activeBookingId = data?.activeJobs.find((j) => j.status === 'accepted')?._id;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        socket.emit('location:update', {
          bookingId: activeBookingId,
          coordinates: [pos.coords.longitude, pos.coords.latitude],
        });
      },
      () => {
        push('Could not read your location — check browser permissions', 'error');
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [sharing, socket, data?.activeJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAvailability = async () => {
    const next = !data?.isAvailable;
    const res = await api<{ isAvailable: boolean }>('/mechanic/availability', {
      method: 'PATCH',
      body: { isAvailable: next },
    });
    setData((d) => (d ? { ...d, isAvailable: res.isAvailable } : d));
    setUser((u: any) => (u ? { ...u, mechanicProfile: { ...u.mechanicProfile, isAvailable: res.isAvailable } } : u));
    push(res.isAvailable ? 'You are online and can receive jobs' : 'You are offline', 'info');
  };

  if (!data) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hello, {user?.name.split(' ')[0]} 👋</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {data.isAvailable ? 'You are online and visible to nearby customers.' : 'You are offline — no new jobs will reach you.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSharing((s) => !s)}
            className={`btn ${sharing ? 'btn-primary' : 'btn-secondary'} text-sm`}
            title="Streams your GPS to the customer's tracking map"
          >
            {sharing ? '📡 Sharing live location' : '📍 Share live location'}
          </button>
          <button onClick={toggleAvailability} className={`btn ${data.isAvailable ? 'btn-danger' : 'btn-primary'} text-sm`}>
            {data.isAvailable ? 'Go offline' : 'Go online'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today's earnings" value={rupees(data.stats.todayEarnings)} icon="💰" tone="success" hint={`${data.stats.completedToday} job(s) completed`} />
        <StatCard label="Jobs today" value={data.stats.todayJobs} icon="🔧" />
        <StatCard label="Open requests nearby" value={data.stats.openRequests} icon="📨" tone={data.stats.openRequests > 0 ? 'warn' : 'default'} />
        <StatCard label="Your rating" value={`${data.stats.rating.toFixed(1)} ★`} icon="⭐" hint={`${data.stats.ratingCount} ratings · ${data.stats.totalCompleted} jobs done`} />
      </div>

      <section>
        <SectionTitle
          title="Active jobs"
          subtitle="Jobs assigned to you right now"
          action={
            <Link href="/mechanic/jobs" className="btn-secondary text-sm">
              Browse open jobs
            </Link>
          }
        />

        {data.activeJobs.length === 0 ? (
          <div className="card py-12 text-center">
            <span className="text-4xl">☕</span>
            <p className="mt-3 font-semibold">No active jobs</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {data.stats.openRequests > 0
                ? `There are ${data.stats.openRequests} open request(s) waiting to be picked up.`
                : 'New requests will appear here the moment they come in.'}
            </p>
            <Link href="/mechanic/jobs" className="btn-primary mt-4 text-sm">
              See open jobs
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.activeJobs.map((job) => (
              <Link key={job._id} href={`/mechanic/jobs/detail?id=${job._id}`} className="card transition hover:border-brand-400 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">
                      {job.serviceType?.icon} {job.serviceType?.name}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{job.reference}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={job.status} />
                    {job.kind === 'sos' && (
                      <span className="badge bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">🚨 SOS</span>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    <strong>{job.customer?.name}</strong> · {job.customer?.phone}
                  </p>
                  <p className="text-slate-600 dark:text-slate-400">
                    {job.vehicle.make} {job.vehicle.model} ({job.vehicle.registrationNumber})
                  </p>
                  <p className="text-slate-600 dark:text-slate-400">📍 {job.pickupLocation.address || 'Location shared'}</p>
                  {job.status === 'accepted' && job.etaMinutes !== undefined && (
                    <p className="font-medium text-brand-600 dark:text-brand-400">
                      {job.distanceKm} km away · ETA {job.etaMinutes} min
                    </p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="text-sm text-slate-500 dark:text-slate-400">You earn</span>
                  <span className="font-bold">{rupees(job.charges.labour + job.charges.visitFee)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
