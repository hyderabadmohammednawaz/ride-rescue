'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, rupees } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocketEvent } from '@/lib/socket';
import { SosButton } from '@/components/SosButton';
import MapView, { type MapMarker } from '@/components/MapView';
import { SectionTitle, Spinner, StatusBadge, Stars } from '@/components/ui';
import type { Booking, MaintenancePrediction, NearbyMechanic, ServiceType, SparePart } from '@/lib/types';

const URGENCY_STYLE: Record<string, string> = {
  overdue: 'border-red-300 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10',
  due_now: 'border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
  due_soon: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
  ok: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
};

export default function CustomerHome() {
  const { user } = useAuth();
  const [services, setServices] = useState<ServiceType[]>([]);
  const [nearby, setNearby] = useState<NearbyMechanic[]>([]);
  const [active, setActive] = useState<Booking[]>([]);
  const [maintenance, setMaintenance] = useState<{ healthScore: number; predictions: MaintenancePrediction[] } | null>(null);
  const [recommended, setRecommended] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);

  const primaryVehicle = user?.vehicles?.find((v) => v.isPrimary) || user?.vehicles?.[0];

  useEffect(() => {
    if (!user) return;
    (async () => {
      const results = await Promise.allSettled([
        api<{ services: ServiceType[] }>('/services'),
        api<{ mechanics: NearbyMechanic[] }>('/services/mechanics/nearby?limit=6'),
        api<{ bookings: Booking[] }>('/bookings?status=pending,accepted,arrived,in_progress'),
        api<{ recommendations: SparePart[] }>('/parts/recommended?limit=4'),
        primaryVehicle
          ? api<{ healthScore: number; predictions: MaintenancePrediction[] }>(`/profile/vehicles/${primaryVehicle._id}/maintenance`)
          : Promise.resolve(null),
      ]);

      if (results[0].status === 'fulfilled') setServices(results[0].value.services);
      if (results[1].status === 'fulfilled') setNearby(results[1].value.mechanics);
      if (results[2].status === 'fulfilled') setActive(results[2].value.bookings);
      if (results[3].status === 'fulfilled') setRecommended(results[3].value.recommendations);
      if (results[4].status === 'fulfilled' && results[4].value) setMaintenance(results[4].value as any);
      setLoading(false);
    })();
  }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  useSocketEvent<Booking>('booking:updated', (booking) => {
    setActive((current) => {
      const others = current.filter((b) => b._id !== booking._id);
      return ['pending', 'accepted', 'arrived', 'in_progress'].includes(booking.status) ? [booking, ...others] : others;
    });
  });

  if (loading) return <Spinner />;

  const markers: MapMarker[] = [
    ...(user?.location?.coordinates
      ? [
          {
            id: 'me',
            position: [user.location.coordinates[1], user.location.coordinates[0]] as [number, number],
            kind: 'customer' as const,
            label: 'You are here',
            sublabel: user.location.address,
          },
        ]
      : []),
    ...nearby.map((m) => ({
      id: m._id,
      position: [m.coordinates[1], m.coordinates[0]] as [number, number],
      kind: 'mechanic' as const,
      label: m.name,
      sublabel: `${m.distanceKm} km · ETA ${m.etaMinutes} min · ${m.rating.toFixed(1)}★`,
    })),
  ];

  const urgent = maintenance?.predictions.filter((p) => p.urgency !== 'ok').slice(0, 4) || [];

  return (
    <div className="space-y-8">
      {active.length > 0 && (
        <section>
          <SectionTitle title="Active request" subtitle="Tap to track your mechanic live" />
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((b) => (
              <Link key={b._id} href={`/customer/bookings/${b._id}`} className="card transition hover:border-brand-400 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {b.serviceType?.icon} {b.serviceType?.name}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{b.reference}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                {b.mechanic ? (
                  <p className="mt-3 text-sm">
                    <strong>{b.mechanic.name}</strong>
                    {b.status === 'accepted' && b.etaMinutes !== undefined && (
                      <span className="text-slate-600 dark:text-slate-400">
                        {' '}· arriving in {b.etaMinutes} min ({b.distanceKm} km away)
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Looking for a mechanic nearby…</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="card flex flex-col items-center justify-center border-red-200 bg-gradient-to-b from-red-50 to-white py-8 dark:border-red-500/20 dark:from-red-500/5 dark:to-slate-900">
          <h2 className="mb-1 text-xl font-bold">Broken down?</h2>
          <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">We will find the nearest mechanic instantly</p>
          <SosButton />
          {user?.emergencyContact?.phone && (
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              🆘 {user.emergencyContact.name || 'Your emergency contact'} will also be alerted
            </p>
          )}
        </div>

        <div>
          <SectionTitle
            title={`${nearby.length} mechanics near you`}
            subtitle="Ranked by our AI on distance, rating, experience and workload"
          />
          <MapView markers={markers} height={340} radiusCenter={markers[0]?.position} radiusKm={5} />
        </div>
      </section>

      <section>
        <SectionTitle title="Book a service" subtitle="Doorstep servicing at a fixed price" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => (
            <Link
              key={s._id}
              href={`/customer/book?service=${s._id}`}
              className="card group transition hover:border-brand-400 hover:shadow-md"
            >
              <span className="text-3xl">{s.icon}</span>
              <h3 className="mt-2.5 font-bold leading-tight">{s.name}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{s.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-bold text-brand-600 dark:text-brand-400">{rupees(s.basePrice)}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">~{s.estimatedMinutes} min</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {maintenance && primaryVehicle && (
        <section>
          <SectionTitle
            title="Predictive maintenance"
            subtitle={`AI forecast for your ${primaryVehicle.make} ${primaryVehicle.model} (${primaryVehicle.registrationNumber})`}
            action={
              <Link href="/customer/profile" className="btn-secondary text-xs">
                Full report
              </Link>
            }
          />
          <div className="mb-3 flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="relative h-16 w-16 shrink-0">
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="7" className="text-slate-200 dark:text-slate-800" />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 28}
                  strokeDashoffset={2 * Math.PI * 28 * (1 - maintenance.healthScore / 100)}
                  className={maintenance.healthScore > 60 ? 'text-emerald-500' : maintenance.healthScore > 30 ? 'text-amber-500' : 'text-red-500'}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">{maintenance.healthScore}</span>
            </div>
            <div>
              <p className="font-semibold">Bike health score</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {urgent.length === 0
                  ? 'Everything is within its service interval.'
                  : `${urgent.length} item(s) need attention soon.`}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(urgent.length > 0 ? urgent : maintenance.predictions.slice(0, 4)).map((p) => (
              <div key={p.key} className={`rounded-2xl border p-4 ${URGENCY_STYLE[p.urgency]}`}>
                <div className="flex items-start justify-between">
                  <span className="text-2xl">{p.icon}</span>
                  <span
                    className={`badge ${
                      p.urgency === 'overdue'
                        ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300'
                        : p.urgency === 'due_now'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {p.urgency === 'overdue' ? 'Overdue' : p.urgency === 'due_now' ? 'Due now' : `${p.daysRemaining}d`}
                  </span>
                </div>
                <h4 className="mt-2 text-sm font-bold leading-tight">{p.label}</h4>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{p.reason}</p>
                <p className="mt-2 text-sm font-semibold">≈ {rupees(p.estimatedCost)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {recommended.length > 0 && (
        <section>
          <SectionTitle
            title="Recommended for your bike"
            subtitle="Picked from your bike model, service history and what other riders buy"
            action={
              <Link href="/customer/store" className="btn-secondary text-xs">
                Browse store
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recommended.map((p) => (
              <Link key={p._id} href={`/customer/store/${p._id}`} className="card transition hover:border-brand-400 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <span className="text-3xl">{p.image || '🔩'}</span>
                  <Stars value={p.ratingAverage} />
                </div>
                <h4 className="mt-2 line-clamp-2 text-sm font-bold leading-tight">{p.name}</h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{p.brand}</p>
                <p className="mt-2 font-bold text-brand-600 dark:text-brand-400">{rupees(p.price)}</p>
                {p.reasons?.[0] && (
                  <p className="mt-2 rounded-lg bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                    ✨ {p.reasons[0]}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {nearby.length > 0 && (
        <section>
          <SectionTitle title="Top-ranked mechanics nearby" subtitle="Why our AI ranked them this way" />
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {nearby.slice(0, 6).map((m, i) => (
              <div key={m._id} className="card">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ background: m.avatarColor || '#2563eb' }}
                  >
                    {m.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate font-bold">{m.name}</h4>
                      {i === 0 && (
                        <span className="badge shrink-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                          Best match
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Stars value={m.rating} />
                      <span>({m.ratingCount})</span>
                      <span>· {m.experienceYears} yr exp</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold">{m.distanceKm} km</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{m.etaMinutes} min</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.reasons.slice(0, 3).map((r) => (
                    <span key={r} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {r}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Match score <strong className="text-brand-600 dark:text-brand-400">{(m.matchScore * 100).toFixed(0)}%</strong>
                  </span>
                  <Link href={`/customer/book?mechanic=${m._id}`} className="btn-primary px-3 py-1.5 text-xs">
                    Book
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
