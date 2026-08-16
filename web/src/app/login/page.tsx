'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthCard, FormError } from '@/components/AuthCard';
import { useAuth } from '@/lib/auth';

const DEMO = [
  { label: 'Customer', email: 'customer@riderescue.in', icon: '🧑' },
  { label: 'Mechanic', email: 'mechanic@riderescue.in', icon: '🔧' },
  { label: 'Vendor', email: 'vendor@riderescue.in', icon: '🏪' },
  { label: 'Admin', email: 'admin@riderescue.in', icon: '🛡️' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent, presetEmail?: string) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(presetEmail || email, presetEmail ? 'password123' : password);
    } catch (err: any) {
      // An unverified account needs the OTP screen rather than an error.
      if (err.status === 403) {
        router.push(`/verify-otp?email=${encodeURIComponent(presetEmail || email)}`);
        return;
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to book a service, track your mechanic or manage your shop."
      footer={
        <>
          New here?{' '}
          <Link href="/register" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Create an account
          </Link>
        </>
      }
    >
      <FormError message={error} />

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">
              Password
            </label>
            <Link href="/forgot-password" className="mb-1.5 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>

        <button type="submit" disabled={busy} className="btn-primary w-full py-3">
          {busy ? 'Signing in…' : 'Log in'}
        </button>
      </form>

      <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          One-click demo login
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              onClick={(e) => submit(e, d.email)}
              disabled={busy}
              className="btn-secondary justify-start text-xs"
            >
              <span>{d.icon}</span>
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </AuthCard>
  );
}
