'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from './Toast';
import type { Booking } from '@/lib/types';

const HOLD_MS = 2000;

/**
 * Press-and-hold SOS. The hold is deliberate: a single tap on a phone in a
 * pocket must not dispatch a mechanic.
 */
export function SosButton({ onDispatched }: { onDispatched?: (booking: Booking) => void }) {
  const [progress, setProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startedAt = useRef(0);
  const router = useRouter();
  const { push } = useToast();

  const clear = () => {
    if (timerRef.current) cancelAnimationFrame(timerRef.current);
    timerRef.current = null;
    setProgress(0);
  };

  useEffect(() => clear, []);

  const fire = async () => {
    clear();
    setSending(true);
    try {
      const coordinates = await new Promise<[number, number] | undefined>((resolve) => {
        if (!navigator.geolocation) return resolve(undefined);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve([p.coords.longitude, p.coords.latitude]),
          () => resolve(undefined),
          { enableHighAccuracy: true, timeout: 6000 }
        );
      });

      const res = await api<{ booking: Booking }>('/bookings', {
        method: 'POST',
        body: { kind: 'sos', description: 'Emergency breakdown — SOS raised from the app', coordinates },
      });

      push(
        res.booking.mechanic
          ? `${res.booking.mechanic.name} is on the way — ETA ${res.booking.etaMinutes} min`
          : 'SOS sent. Finding you a mechanic…',
        'success'
      );
      onDispatched?.(res.booking);
      // The id goes in the query string, not the path: a static export has to
      // know every page at build time, and booking ids do not exist until
      // someone books.
      router.push(`/customer/bookings/detail?id=${res.booking._id}`);
    } catch (err: any) {
      push(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const tick = () => {
    const elapsed = Date.now() - startedAt.current;
    const pct = Math.min(1, elapsed / HOLD_MS);
    setProgress(pct);
    if (pct >= 1) fire();
    else timerRef.current = requestAnimationFrame(tick);
  };

  const start = () => {
    if (sending) return;
    startedAt.current = Date.now();
    timerRef.current = requestAnimationFrame(tick);
  };

  const circumference = 2 * Math.PI * 76;

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-48 w-48 items-center justify-center">
        {!sending && <span className="absolute h-32 w-32 rounded-full bg-red-500/30 animate-pulseRing" />}

        <svg className="absolute h-44 w-44 -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="76" fill="none" stroke="currentColor" strokeWidth="6" className="text-red-200 dark:text-red-500/20" />
          <circle
            cx="80"
            cy="80"
            r="76"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            className="text-red-600 transition-none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        </svg>

        <button
          onMouseDown={start}
          onMouseUp={clear}
          onMouseLeave={clear}
          onTouchStart={start}
          onTouchEnd={clear}
          onContextMenu={(e) => e.preventDefault()}
          disabled={sending}
          className="relative z-10 flex h-32 w-32 select-none flex-col items-center justify-center rounded-full bg-red-600 text-white shadow-xl transition active:scale-95 hover:bg-red-700 disabled:opacity-70"
        >
          <span className="text-3xl">{sending ? '📡' : '🚨'}</span>
          <span className="mt-1 text-xl font-extrabold tracking-wide">{sending ? 'SENDING' : 'SOS'}</span>
        </button>
      </div>

      <p className="mt-3 max-w-xs text-center text-sm text-slate-600 dark:text-slate-400">
        {sending
          ? 'Sharing your location and finding the nearest mechanic…'
          : progress > 0
            ? 'Keep holding…'
            : 'Press and hold for 2 seconds to dispatch the nearest mechanic'}
      </p>
    </div>
  );
}
