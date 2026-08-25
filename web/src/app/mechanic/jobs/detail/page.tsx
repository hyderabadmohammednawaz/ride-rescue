'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { api, formatDateTime, rupees } from '@/lib/api';
import { useSocket, useSocketEvent } from '@/lib/socket';
import { useToast } from '@/components/Toast';
import MapView, { type MapMarker } from '@/components/MapView';
import { BookingChat } from '@/components/BookingChat';
import { Spinner, StatusBadge } from '@/components/ui';
import type { Booking, SparePart } from '@/lib/types';

interface UsedPart {
  part: string;
  name: string;
  quantity: number;
  price: number;
}

function JobDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') as string;
  const router = useRouter();
  const { socket } = useSocket();
  const { push } = useToast();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [suggested, setSuggested] = useState<SparePart[]>([]);
  const [used, setUsed] = useState<UsedPart[]>([]);
  const [labour, setLabour] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    const { booking } = await api<{ booking: Booking }>(`/bookings/${id}`);
    setBooking(booking);
    setLabour(String(booking.charges.labour));
    setUsed(booking.partsUsed.map((p) => ({ part: String(p.part || ''), name: p.name, quantity: p.quantity, price: p.price })));
  }, [id]);

  useEffect(() => {
    load().catch((err) => push(err.message, 'error'));
    api<{ parts: SparePart[] }>(`/bookings/${id}/suggested-parts`)
      .then((d) => setSuggested(d.parts))
      .catch(() => {});
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  useSocketEvent<Booking>('booking:updated', (updated) => {
    if (updated._id === id) setBooking(updated);
  });

  // Push this device's GPS while riding to the customer.
  useEffect(() => {
    if (!sharing || !socket || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => socket.emit('location:update', { bookingId: id, coordinates: [pos.coords.longitude, pos.coords.latitude] }),
      () => {
        push('Could not read your location', 'error');
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 4000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [sharing, socket, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeStatus = async (status: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const { booking: updated } = await api<{ booking: Booking }>(`/bookings/${id}/status`, {
        method: 'PATCH',
        body: { status, ...extra },
      });
      setBooking(updated);
      push(`Job marked as ${status.replace(/_/g, ' ')}`, 'success');
    } catch (err: any) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const addPart = (part: SparePart) => {
    setUsed((current) => {
      const existing = current.find((u) => u.part === part._id);
      if (existing) return current.map((u) => (u.part === part._id ? { ...u, quantity: u.quantity + 1 } : u));
      return [...current, { part: part._id, name: part.name, quantity: 1, price: part.price }];
    });
  };

  if (!booking) return <Spinner />;

  const partsTotal = used.reduce((s, p) => s + p.price * p.quantity, 0);
  const grandTotal = Number(labour || 0) + partsTotal + booking.charges.visitFee;

  const pickup = booking.pickupLocation.coordinates;
  const mechanicCoords = booking.mechanicLocation?.coordinates as [number, number] | undefined;
  const markers: MapMarker[] = [
    { id: 'pickup', position: [pickup[1], pickup[0]], kind: 'customer', label: booking.customer?.name || 'Customer', sublabel: booking.pickupLocation.address },
    ...(mechanicCoords ? [{ id: 'me', position: [mechanicCoords[1], mechanicCoords[0]] as [number, number], kind: 'mechanic' as const, label: 'You' }] : []),
  ];

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${pickup[1]},${pickup[0]}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/mechanic" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {booking.serviceType?.icon} {booking.serviceType?.name}
          </h1>
          <p className="mt-0.5 font-mono text-sm text-slate-500 dark:text-slate-400">{booking.reference}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={booking.status} />
          {booking.kind === 'sos' && <span className="badge bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">🚨 SOS</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold">Navigate to the customer</h3>
              <div className="flex gap-2">
                <button onClick={() => setSharing((s) => !s)} className={`btn ${sharing ? 'btn-primary' : 'btn-secondary'} text-xs`}>
                  {sharing ? '📡 Sharing location' : '📍 Share my location'}
                </button>
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                  🧭 Open in Maps
                </a>
              </div>
            </div>
            <div className="mt-3">
              <MapView markers={markers} route={mechanicCoords ? [[mechanicCoords[1], mechanicCoords[0]], [pickup[1], pickup[0]]] : undefined} height={300} />
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              📍 {booking.pickupLocation.address || 'Address not provided'}
              {booking.distanceKm !== undefined && ` · ${booking.distanceKm} km from you`}
            </p>
          </div>

          {booking.status === 'in_progress' && (
            <div className="card">
              <h3 className="font-bold">Parts used on this job</h3>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Suggested for a {booking.serviceType?.name.toLowerCase()} on a {booking.vehicle.model}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {suggested.map((p) => (
                  <button key={p._id} onClick={() => addPart(p)} className="btn-secondary text-xs">
                    + {p.image} {p.name} ({rupees(p.price)})
                  </button>
                ))}
              </div>

              {used.length > 0 && (
                <div className="mt-4 space-y-2">
                  {used.map((u) => (
                    <div key={u.part} className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{u.name}</span>
                      <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700">
                        <button
                          onClick={() =>
                            setUsed((c) => c.map((x) => (x.part === u.part ? { ...x, quantity: Math.max(0, x.quantity - 1) } : x)).filter((x) => x.quantity > 0))
                          }
                          className="px-2.5 py-1"
                        >
                          −
                        </button>
                        <span className="w-7 text-center">{u.quantity}</span>
                        <button onClick={() => setUsed((c) => c.map((x) => (x.part === u.part ? { ...x, quantity: x.quantity + 1 } : x)))} className="px-2.5 py-1">
                          +
                        </button>
                      </div>
                      <span className="w-20 text-right font-semibold">{rupees(u.price * u.quantity)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <label className="label">Labour charge</label>
                <input type="number" value={labour} onChange={(e) => setLabour(e.target.value)} className="input" />
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
                <span className="font-semibold">Total bill</span>
                <span className="text-xl font-bold">{rupees(grandTotal)}</span>
              </div>

              <button
                onClick={() => changeStatus('completed', { labourCharge: Number(labour), partsUsed: used })}
                disabled={busy}
                className="btn-primary mt-4 w-full py-3"
              >
                {busy ? 'Saving…' : 'Mark job complete'}
              </button>
            </div>
          )}

          <BookingChat bookingId={booking._id} otherPartyName={booking.customer?.name} />
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-3 font-bold">Customer</h3>
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
                style={{ background: booking.customer?.avatarColor || '#dc2626' }}
              >
                {booking.customer?.name?.charAt(0)}
              </div>
              <div>
                <p className="font-bold">{booking.customer?.name}</p>
                <a href={`tel:${booking.customer?.phone}`} className="text-sm text-brand-600 hover:underline dark:text-brand-400">
                  📞 {booking.customer?.phone}
                </a>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Vehicle</dt>
                <dd className="text-right font-medium">
                  {booking.vehicle.make} {booking.vehicle.model}
                  <br />
                  <span className="font-mono text-xs">{booking.vehicle.registrationNumber}</span>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Requested</dt>
                <dd className="font-medium">{formatDateTime(booking.createdAt)}</dd>
              </div>
            </dl>
            {booking.description && (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">"{booking.description}"</p>
            )}
          </div>

          <div className="card">
            <h3 className="mb-3 font-bold">Update job status</h3>

            {booking.status === 'accepted' && (
              <button onClick={() => changeStatus('arrived')} disabled={busy} className="btn-primary w-full">
                📍 I have arrived
              </button>
            )}

            {booking.status === 'arrived' && (
              <div>
                <label className="label">Start OTP from the customer</label>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  maxLength={4}
                  inputMode="numeric"
                  className="input text-center text-2xl font-bold tracking-[0.4em]"
                  placeholder="····"
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Ask the customer to read out the 4-digit code shown in their app.
                </p>
                <button onClick={() => changeStatus('in_progress', { otpCode: otp })} disabled={busy || otp.length !== 4} className="btn-primary mt-3 w-full">
                  🔧 Start work
                </button>
              </div>
            )}

            {booking.status === 'in_progress' && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Add the parts you used, set the labour charge, then mark the job complete on the left.
              </p>
            )}

            {booking.status === 'completed' && (
              <div className="text-center">
                <span className="text-3xl">✅</span>
                <p className="mt-2 font-semibold">Job completed</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Total {rupees(booking.charges.total)} · payment {booking.paymentStatus}
                </p>
                <button onClick={() => router.push('/mechanic')} className="btn-secondary mt-4 w-full text-sm">
                  Back to dashboard
                </button>
              </div>
            )}

            {['accepted'].includes(booking.status) && (
              <button
                onClick={async () => {
                  if (!window.confirm('Decline this job? It will be offered to another mechanic.')) return;
                  await api(`/bookings/${id}/reject`, { method: 'POST', body: {} });
                  push('Job returned to the pool', 'info');
                  router.push('/mechanic');
                }}
                className="btn-secondary mt-2 w-full text-sm text-red-600 dark:text-red-400"
              >
                Decline job
              </button>
            )}
          </div>

          <div className="card">
            <h3 className="mb-3 font-bold">Earnings from this job</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Labour</dt>
                <dd>{rupees(Number(labour || booking.charges.labour))}</dd>
              </div>
              {booking.charges.visitFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Emergency visit fee</dt>
                  <dd>{rupees(booking.charges.visitFee)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-2 font-bold dark:border-slate-800">
                <dt>You earn</dt>
                <dd>{rupees(Number(labour || booking.charges.labour) + booking.charges.visitFee)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Spare parts are billed to the customer on the vendor's behalf and are not part of your earnings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JobDetailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <JobDetailContent />
    </Suspense>
  );
}
