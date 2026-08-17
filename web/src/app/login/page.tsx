'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthCard, FormError } from '@/components/AuthCard';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  RECAPTCHA_CONTAINER_ID,
  clearVerifier,
  confirmOtp,
  describeAuthError,
  isValidIndianMobile,
  resendOtp,
  sendOtp,
  toE164,
  type Confirmation,
} from '@/lib/phoneAuth';
import type { User } from '@/lib/types';

/**
 * Only the roles that still have a seeded account. The demo customer and
 * mechanic were deleted so that side of the app runs on real, phone-verified
 * signups — a button that logs into a deleted account is worse than no button.
 */
const DEMO = [
  { label: 'Vendor', email: 'vendor@riderescue.in', icon: '🏪' },
  { label: 'Admin', email: 'admin@riderescue.in', icon: '🛡️' },
];

const RESEND_SECONDS = 30;

export default function LoginPage() {
  const { login, completeAuth } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'email' | 'phone'>('email');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [phone, setPhone] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirmation || seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds, confirmation]);

  useEffect(() => clearVerifier, []);

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

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!isValidIndianMobile(phone)) {
        throw new Error('Enter a 10-digit Indian mobile number starting 6, 7, 8 or 9.');
      }
      setConfirmation(await sendOtp(phone));
      setSeconds(RESEND_SECONDS);
    } catch (err: any) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmation) return;
    setError(null);
    setBusy(true);
    try {
      const idToken = await confirmOtp(confirmation, code);
      const res = await api<{ token: string; user: User }>('/auth/phone/login', {
        method: 'POST',
        auth: false,
        body: { idToken },
      });
      clearVerifier();
      completeAuth(res.token, res.user);
    } catch (err: any) {
      // The backend answers 404 when the number has no account yet, which is a
      // signpost to registration rather than a failure.
      if (err.status === 404) {
        setError('No account uses that mobile number yet. Create one below.');
      } else {
        setError(describeAuthError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setBusy(true);
    try {
      setConfirmation(await resendOtp(phone));
      setCode('');
      setSeconds(RESEND_SECONDS);
    } catch (err: any) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: 'email' | 'phone') => {
    setMode(next);
    setError(null);
    setConfirmation(null);
    setCode('');
    clearVerifier();
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

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
        {(
          [
            ['email', 'Email & password'],
            ['phone', 'Mobile OTP'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => switchMode(value)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              mode === value
                ? 'bg-white shadow-sm dark:bg-slate-700'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'email' && (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
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
              <label className="label" htmlFor="password">Password</label>
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
      )}

      {mode === 'phone' && !confirmation && (
        <form onSubmit={sendCode} className="space-y-4">
          <div>
            <label className="label" htmlFor="phone">Mobile number</label>
            <input
              id="phone"
              required
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input"
              placeholder="10-digit mobile"
              autoComplete="tel"
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              We will text you a one-time password. No password needed.
            </p>
          </div>

          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy ? 'Sending code…' : 'Send OTP'}
          </button>
        </form>
      )}

      {mode === 'phone' && confirmation && (
        <>
          <form onSubmit={verify} className="space-y-4">
            <div>
              <label className="label" htmlFor="code">
                Code sent to {toE164(phone)}
              </label>
              <input
                id="code"
                required
                autoFocus
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="input text-center text-2xl font-bold tracking-[0.5em]"
                placeholder="······"
              />
            </div>

            <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full py-3">
              {busy ? 'Verifying…' : 'Verify and log in'}
            </button>
          </form>

          <button
            onClick={resend}
            disabled={seconds > 0 || busy}
            className="mt-4 w-full text-center text-sm font-semibold text-brand-600 disabled:text-slate-400 hover:underline dark:text-brand-400"
          >
            {seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
          </button>
        </>
      )}

      <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
        <p className="mb-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          One-click demo login
        </p>
        <p className="mb-3 text-center text-xs text-slate-500 dark:text-slate-400">
          Customers and mechanics use real accounts — sign up with your mobile number.
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

      {/* Firebase renders the invisible reCAPTCHA challenge into this element. */}
      <div id={RECAPTCHA_CONTAINER_ID} />
    </AuthCard>
  );
}
