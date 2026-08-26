'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, formatDateTime, rupees } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocketEvent } from '@/lib/socket';
import { useBookingRoom } from '@/lib/useBookingRoom';
import { useToast } from '@/components/Toast';
import MapView, { type MapMarker } from '@/components/MapView';
import { BookingChat } from '@/components/BookingChat';
import { PaymentDialog } from '@/components/PaymentDialog';
import { Spinner, StatusBadge, Stars } from '@/components/ui';
import type { Booking } from '@/lib/types';

const STEPS: { key: string; label: string; icon: string }[] = [
  { key: 'pending', label: 'Request sent', icon: '📨' },
  { key: 'accepted', label: 'Mechanic on the way', icon: '🏍️' },
  { key: 'arrived', label: 'Arrived', icon: '📍' },
  { key: 'in_progress', label: 'Work in progress', icon: '🔧' },
  { key: 'completed', label: 'Completed', icon: '✅' },
];

function TrackBookingContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') as string;

  // Live location and chat are broadcast to the booking's room; a page that
  // listens without joining hears nothing.
  useBookingRoom(id);
  const { user, refresh } = useAuth();
  const { push } = useToast();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [live, setLive] = useState<{ coordinates: [number, number]; etaMinutes: number; distanceKm: number } | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const load = useCallback(async () => {
    const { booking } = await api<{ booking: Booking }>(`/bookings/${id}`);
    setBooking(booking);
  }, [id]);

  useEffect(() => {
    load().catch((err) => push(err.message, 'error'));
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  useSocketEvent<Booking>('booking:updated', (updated) => {
    if (updated._id === id) setBooking(updated);
  });

  useSocketEvent<{ bookingId: string; coordinates: [number, number]; etaMinutes: number; distanceKm: number }>(
    'booking:location',
    (payload) => {
      if (payload.bookingId === id) setLive(payload);
    }
  );

  const submitReview = async () => {
    if (!rating) return;
    setSubmittingReview(true);
    try {
      await api(`/bookings/${id}/review`, { method: 'POST', body: { rating, comment } });
      push('Thanks for rating your mechanic', 'success');
      await load();
    } catch (err: any) {
      push(err.message, 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  const cancel = async () => {
    const reason = window.prompt('Why are you cancelling? (optional)') ?? undefined;
    try {
      await api(`/bookings/${id}/cancel`, { method: 'POST', body: { reason } });
      push('Booking cancelled', 'info');
      await load();
    } catch (err: any) {
      push(err.message, 'error');
    }
  };

  if (!booking) return <Spinner label="Loading your booking…" />;

  const mechanicCoords = live?.coordinates || (booking.mechanicLocation?.coordinates as [number, number] | undefined);
  const pickup = booking.pickupLocation.coordinates;
  const eta = live?.etaMinutes ?? booking.etaMinutes;
  const distance = live?.distanceKm ?? booking.distanceKm;

  const markers: MapMarker[] = [
    { id: 'pickup', position: [pickup[1], pickup[0]], kind: 'customer', label: 'You', sublabel: booking.pickupLocation.address },
    ...(mechanicCoords && booking.mechanic
      ? [
          {
            id: 'mechanic',
            position: [mechanicCoords[1], mechanicCoords[0]] as [number, number],
            kind: 'mechanic' as const,
            label: booking.mechanic.name,
            sublabel: eta !== undefined ? `ETA ${eta} min · ${distance} km` : undefined,
          },
        ]
      : []),
  ];

  const route: [number, number][] | undefined =
    mechanicCoords && ['accepted'].includes(booking.status)
      ? [
          [mechanicCoords[1], mechanicCoords[0]],
          [pickup[1], pickup[0]],
        ]
      : undefined;

  const currentStep = STEPS.findIndex((s) => s.key === booking.status);
  const cancellable = ['pending', 'accepted'].includes(booking.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/customer/bookings" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
            ← All bookings
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {booking.serviceType?.icon} {booking.serviceType?.name}
          </h1>
          <p className="mt-0.5 font-mono text-sm text-slate-500 dark:text-slate-400">{booking.reference}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={booking.status} />
          {booking.kind === 'sos' && (
            <span className="badge bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">🚨 Emergency</span>
          )}
        </div>
      </div>

      {booking.status !== 'cancelled' && (
        <div className="card">
          <div className="flex items-center justify-between gap-1 overflow-x-auto">
            {STEPS.map((step, i) => {
              const done = i <= currentStep;
              return (
                <div key={step.key} className="flex flex-1 items-center">
                  <div className="flex min-w-[70px] flex-col items-center gap-1.5">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-base transition ${
                        done ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                      }`}
                    >
                      {step.icon}
                    </div>
                    <span className={`text-center text-[11px] leading-tight ${done ? 'font-semibold' : 'text-slate-400'}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 ${i < currentStep ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-800'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {['accepted', 'arrived', 'in_progress'].includes(booking.status) && (
            <div>
              {booking.status === 'accepted' && eta !== undefined && (
                <div className="mb-3 flex items-center justify-between rounded-2xl bg-brand-600 px-5 py-4 text-white">
                  <div>
                    <p className="text-sm text-brand-100">Arriving in</p>
                    <p className="text-3xl font-extrabold">{eta} min</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-brand-100">Distance</p>
                    <p className="text-xl font-bold">{distance} km</p>
                  </div>
                </div>
              )}
              <MapView markers={markers} route={route} height={360} />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                The mechanic's position updates live as they ride toward you.
              </p>
            </div>
          )}

          {booking.mechanic && (
            <div className="card">
              <h3 className="mb-3 font-bold">Your mechanic</h3>
              <div className="flex items-start gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{ background: booking.mechanic.avatarColor || '#2563eb' }}
                >
                  {booking.mechanic.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="text-lg font-bold">{booking.mechanic.name}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Stars value={booking.mechanic.mechanicProfile?.ratingAverage || 0} />
                    <span>({booking.mechanic.mechanicProfile?.ratingCount || 0} ratings)</span>
                    <span>· {booking.mechanic.mechanicProfile?.experienceYears || 0} yrs</span>
                  </div>
                  <a href={`tel:${booking.mechanic.phone}`} className="btn-secondary mt-3 text-xs">
                    📞 {booking.mechanic.phone}
                  </a>
                </div>
              </div>

              {booking.recommendation?.reasons && (
                <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Why we picked them
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {booking.recommendation.reasons.map((r) => (
                      <li key={r} className="text-sm text-slate-700 dark:text-slate-300">
                        ✓ {r}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Chosen from {booking.recommendation.consideredCount} available mechanics · match score{' '}
                    {(booking.recommendation.score * 100).toFixed(0)}%
                  </p>
                </div>
              )}
            </div>
          )}

          {['accepted', 'arrived'].includes(booking.status) && booking.otpCode && (
            <div className="card border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="font-bold text-amber-900 dark:text-amber-200">Start OTP</h3>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                Share this code with the mechanic only after they arrive. It proves the job actually started at your
                location.
              </p>
              <p className="mt-3 text-center text-4xl font-extrabold tracking-[0.4em] text-amber-900 dark:text-amber-200">
                {booking.otpCode}
              </p>
            </div>
          )}

          {booking.mechanic && !['completed', 'cancelled'].includes(booking.status) && (
            <BookingChat bookingId={booking._id} otherPartyName={booking.mechanic.name} />
          )}

          {booking.status === 'completed' && !booking.rated && (
            <div className="card">
              <h3 className="font-bold">Rate {booking.mechanic?.name}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Your rating feeds directly into who gets recommended next time.
              </p>
              <div className="mt-4 flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    className={`text-4xl transition hover:scale-110 ${n <= rating ? 'text-amber-400' : 'text-slate-300 dark:text-slate-700'}`}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="input mt-4"
                placeholder="How was the service? (optional)"
              />
              <button onClick={submitReview} disabled={!rating || submittingReview} className="btn-primary mt-3 w-full">
                {submittingReview ? 'Submitting…' : 'Submit rating'}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-3 font-bold">Booking details</h3>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Vehicle</dt>
                <dd className="text-right font-medium">
                  {booking.vehicle.make} {booking.vehicle.model}
                  <br />
                  <span className="font-mono text-xs">{booking.vehicle.registrationNumber}</span>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Booked</dt>
                <dd className="text-right font-medium">{formatDateTime(booking.createdAt)}</dd>
              </div>
              {booking.scheduledFor && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">Scheduled for</dt>
                  <dd className="text-right font-medium">{formatDateTime(booking.scheduledFor)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Location</dt>
                <dd className="text-right font-medium">{booking.pickupLocation.address || '—'}</dd>
              </div>
              {booking.description && (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Problem</dt>
                  <dd className="mt-1 font-medium">{booking.description}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card">
            <h3 className="mb-3 font-bold">Charges</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Labour</dt>
                <dd>{rupees(booking.charges.labour)}</dd>
              </div>
              {booking.charges.visitFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Emergency visit fee</dt>
                  <dd>{rupees(booking.charges.visitFee)}</dd>
                </div>
              )}
              {booking.partsUsed.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">
                    {p.name} × {p.quantity}
                  </dt>
                  <dd>{rupees(p.price * p.quantity)}</dd>
                </div>
              ))}
              {booking.charges.discount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <dt>Discount</dt>
                  <dd>−{rupees(booking.charges.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold dark:border-slate-800">
                <dt>Total</dt>
                <dd>{rupees(booking.charges.total)}</dd>
              </div>
            </dl>

            <div className="mt-4 flex items-center justify-between">
              <StatusBadge status={booking.paymentStatus} />
              {booking.status === 'completed' && booking.paymentStatus === 'unpaid' && (
                <button onClick={() => setShowPayment(true)} className="btn-primary text-sm">
                  Pay now
                </button>
              )}
            </div>

            {booking.status === 'completed' && (
              <Link href={`/customer/bookings/invoice?id=${booking._id}`} className="btn-secondary mt-3 w-full text-sm">
                🧾 View invoice
              </Link>
            )}
          </div>

          {cancellable && (
            <button onClick={cancel} className="btn-secondary w-full text-sm text-red-600 dark:text-red-400">
              Cancel booking
            </button>
          )}

          <div className="card">
            <h3 className="mb-3 font-bold">Status history</h3>
            <ol className="space-y-3">
              {booking.statusHistory.map((h, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <div>
                    <p className="font-medium capitalize">{h.status.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(h.at)}</p>
                    {h.note && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{h.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {showPayment && (
        <PaymentDialog
          amount={booking.charges.total}
          purpose="booking"
          bookingId={booking._id}
          walletBalance={user?.walletBalance || 0}
          onPaid={async () => {
            await load();
            await refresh();
          }}
          onClose={() => setShowPayment(false)}
        />
      )}
    </div>
  );
}

export default function TrackBookingPage() {
  return (
    <Suspense fallback={<Spinner label="Loading your booking…" />}>
      <TrackBookingContent />
    </Suspense>
  );
}
