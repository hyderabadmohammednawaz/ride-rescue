'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, rupees } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { SectionTitle, Spinner, Stars } from '@/components/ui';
import MapView, { type MapMarker } from '@/components/MapView';
import type { Booking, NearbyMechanic, ServiceType } from '@/lib/types';

function BookInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { push } = useToast();

  const [services, setServices] = useState<ServiceType[]>([]);
  const [nearby, setNearby] = useState<NearbyMechanic[]>([]);
  const [serviceId, setServiceId] = useState(params.get('service') || '');
  const [vehicleId, setVehicleId] = useState('');
  const [kind, setKind] = useState<'instant' | 'scheduled'>('instant');
  const [scheduledFor, setScheduledFor] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [s, n] = await Promise.all([
        api<{ services: ServiceType[] }>('/services'),
        api<{ mechanics: NearbyMechanic[] }>('/services/mechanics/nearby?limit=5'),
      ]);
      setServices(s.services);
      setNearby(n.mechanics);
      if (!serviceId) setServiceId(s.services.find((x) => x.slug === 'general-service')?._id || s.services[0]?._id || '');
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user && !vehicleId) {
      const primary = user.vehicles.find((v) => v.isPrimary) || user.vehicles[0];
      if (primary) setVehicleId(primary._id);
      if (!address && user.location?.address) setAddress(user.location.address);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const service = services.find((s) => s._id === serviceId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId) {
      push('Add a vehicle to your profile first', 'error');
      router.push('/customer/profile');
      return;
    }
    setBusy(true);
    try {
      const coordinates = await new Promise<[number, number] | undefined>((resolve) => {
        if (!navigator.geolocation) return resolve(undefined);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve([p.coords.longitude, p.coords.latitude]),
          () => resolve(undefined),
          { timeout: 6000 }
        );
      });

      const res = await api<{ booking: Booking }>('/bookings', {
        method: 'POST',
        body: {
          serviceTypeId: serviceId,
          vehicleId,
          kind,
          description,
          address,
          coordinates,
          scheduledFor: kind === 'scheduled' ? scheduledFor : undefined,
        },
      });

      push(
        res.booking.mechanic
          ? `${res.booking.mechanic.name} assigned — ETA ${res.booking.etaMinutes} min`
          : 'Booking created. We are finding a mechanic.',
        'success'
      );
      router.push(`/customer/bookings/${res.booking._id}`);
    } catch (err: any) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;

  const markers: MapMarker[] = [
    ...(user?.location?.coordinates
      ? [{ id: 'me', position: [user.location.coordinates[1], user.location.coordinates[0]] as [number, number], kind: 'customer' as const, label: 'Service location' }]
      : []),
    ...nearby.map((m) => ({
      id: m._id,
      position: [m.coordinates[1], m.coordinates[0]] as [number, number],
      kind: 'mechanic' as const,
      label: m.name,
      sublabel: `${m.distanceKm} km · ${m.etaMinutes} min`,
    })),
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <SectionTitle title="Book a service" subtitle="A mechanic comes to you — no need to push the bike anywhere." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <form onSubmit={submit} className="card space-y-5">
          <div>
            <span className="label">Service</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {services.map((s) => (
                <button
                  key={s._id}
                  type="button"
                  onClick={() => setServiceId(s._id)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    serviceId === s._id
                      ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{s.icon}</span>
                    <span className="flex-1 text-sm font-semibold leading-tight">{s.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {rupees(s.basePrice)} · ~{s.estimatedMinutes} min
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="vehicle">Vehicle</label>
            {user && user.vehicles.length > 0 ? (
              <select id="vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="input">
                {user.vehicles.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.make} {v.model} — {v.registrationNumber}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                No vehicle on file. Add one in your profile before booking.
              </p>
            )}
          </div>

          <div>
            <span className="label">When</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind('instant')}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  kind === 'instant' ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                ⚡ Right now
              </button>
              <button
                type="button"
                onClick={() => setKind('scheduled')}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  kind === 'scheduled' ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                📅 Schedule
              </button>
            </div>
            {kind === 'scheduled' && (
              <input
                type="datetime-local"
                required
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                min={new Date(Date.now() + 3600_000).toISOString().slice(0, 16)}
                className="input mt-2"
              />
            )}
          </div>

          <div>
            <label className="label" htmlFor="address">Service address</label>
            <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} className="input" placeholder="Flat / street / landmark" />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Your exact GPS position is shared with the mechanic once the booking is confirmed.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="desc">What is the problem? (optional)</label>
            <textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input"
              placeholder="e.g. Makes a rattling noise from the chain above 40 km/h"
            />
          </div>

          {service && (
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
              <div className="flex justify-between text-sm">
                <span>{service.name}</span>
                <span className="font-semibold">{rupees(service.basePrice)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Spare parts, if any are needed, are added after the mechanic inspects the bike.
              </p>
            </div>
          )}

          <button type="submit" disabled={busy || !vehicleId} className="btn-primary w-full py-3">
            {busy ? 'Booking…' : kind === 'scheduled' ? 'Schedule service' : 'Book now'}
          </button>
        </form>

        <div className="space-y-4">
          <MapView markers={markers} height={280} />
          <div className="card">
            <h3 className="font-bold">Who will come?</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              For an instant booking we assign the highest-scoring mechanic automatically. Scheduled jobs are offered to
              every nearby mechanic to accept.
            </p>
            <div className="mt-4 space-y-2.5">
              {nearby.slice(0, 3).map((m, i) => (
                <div key={m._id} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: m.avatarColor || '#2563eb' }}>
                    {m.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {m.name} {i === 0 && <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">· likely match</span>}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Stars value={m.rating} /> · {m.distanceKm} km
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <BookInner />
    </Suspense>
  );
}
