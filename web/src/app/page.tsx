'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, HOME_BY_ROLE } from '@/lib/auth';

const FEATURES = [
  { icon: '🚨', title: 'One-tap SOS', text: 'Stranded? One press shares your live location and dispatches the nearest available mechanic.' },
  { icon: '🗺️', title: 'Live tracking', text: 'Watch your mechanic approach on the map with a continuously updated ETA.' },
  { icon: '🤖', title: 'AI mechanic match', text: 'Distance, rating, experience and current workload are scored to pick the best person for the job.' },
  { icon: '🔩', title: 'Spare parts store', text: 'Genuine parts filtered to your exact bike model, delivered to your door.' },
  { icon: '📈', title: 'Predictive maintenance', text: 'We forecast your next oil change, brake and tyre replacement from how you actually ride.' },
  { icon: '💳', title: 'Secure payments', text: 'UPI, card, wallet or cash, with an invoice generated the moment the job is done.' },
];

const DEMO_LOGINS = [
  { role: 'Customer', email: 'customer@riderescue.in' },
  { role: 'Mechanic', email: 'mechanic@riderescue.in' },
  { role: 'Vendor', email: 'vendor@riderescue.in' },
  { role: 'Admin', email: 'admin@riderescue.in' },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace(HOME_BY_ROLE[user.role]);
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏍️</span>
          <span className="text-xl font-extrabold tracking-tight">
            Ride<span className="text-brand-600 dark:text-brand-400">Rescue</span>
          </span>
        </div>
        <div className="flex gap-2">
          <Link href="/login" className="btn-secondary">
            Log in
          </Link>
          <Link href="/register" className="btn-primary">
            Sign up
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 text-center">
        <span className="badge bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300">
          🚀 Real-time roadside assistance for two-wheelers
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Your bike breaks down. <span className="text-brand-600 dark:text-brand-400">Help is already moving.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          RideRescue connects riders with nearby verified mechanics in seconds, tracks them live on a map, and stocks
          the genuine spare parts your bike actually needs.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">
            Get started free
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">
            Try a demo account
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <span className="text-3xl">{f.icon}</span>
              <h3 className="mt-3 text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20">
        <div className="card">
          <h2 className="text-lg font-bold">Demo accounts</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Every seeded account uses the password <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">password123</code>.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {DEMO_LOGINS.map((d) => (
              <div key={d.email} className="rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{d.role}</p>
                <p className="font-mono text-sm">{d.email}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
