'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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

const ROLES = [
  { value: 'customer', label: 'Customer', icon: '🧑', hint: 'Book services and buy parts' },
  { value: 'mechanic', label: 'Mechanic', icon: '🔧', hint: 'Accept jobs and earn' },
  { value: 'vendor', label: 'Vendor', icon: '🏪', hint: 'Sell spare parts' },
];

const RESEND_SECONDS = 30;

export default function RegisterPage() {
  const { completeAuth } = useAuth();
  const [role, setRole] = useState('customer');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    experienceYears: '',
    drivingLicenceNumber: '',
    idProofNumber: '',
    shopName: '',
    gstNumber: '',
    referredBy: '',
  });

  // The OTP step lives on this page rather than a route of its own. The Firebase
  // confirmation handle is a live object that cannot be serialised into a URL or
  // storage, so handing it across a navigation is what makes resends break.
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const finishing = useRef(false);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    if (!confirmation || seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds, confirmation]);

  // The captcha widget outlives React unless it is torn down explicitly.
  useEffect(() => clearVerifier, []);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!isValidIndianMobile(form.phone)) {
        throw new Error('Enter a 10-digit Indian mobile number starting 6, 7, 8 or 9.');
      }

      // Catch a duplicate email before an SMS is spent on a signup that the
      // backend would reject anyway.
      const { available } = await api<{ available: boolean }>('/auth/email-available', {
        method: 'POST',
        auth: false,
        body: { email: form.email },
      });
      if (!available) throw new Error('That email is already registered. Log in instead.');

      setConfirmation(await sendOtp(form.phone));
      setSeconds(RESEND_SECONDS);
      setInfo(null);
    } catch (err: any) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmation || finishing.current) return;
    setError(null);
    setBusy(true);
    try {
      const idToken = await confirmOtp(confirmation, code);
      finishing.current = true;

      // Register with the browser's position when it is available, so a new
      // mechanic immediately shows up in nearest-mechanic searches.
      const coordinates = await new Promise<[number, number] | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve([p.coords.longitude, p.coords.latitude]),
          () => resolve(null),
          { timeout: 5000 }
        );
      });

      const res = await api<{ token: string; user: User }>('/auth/phone/register', {
        method: 'POST',
        auth: false,
        body: {
          idToken,
          ...form,
          role,
          experienceYears: form.experienceYears ? Number(form.experienceYears) : undefined,
          location: coordinates ? { coordinates } : undefined,
        },
      });

      clearVerifier();
      completeAuth(res.token, res.user);
    } catch (err: any) {
      finishing.current = false;
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      setConfirmation(await resendOtp(form.phone));
      setCode('');
      setSeconds(RESEND_SECONDS);
      setInfo('A new code is on its way.');
    } catch (err: any) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (confirmation) {
    return (
      <AuthCard
        title="Verify your number"
        subtitle={`Enter the 6-digit code we sent to ${toE164(form.phone)}.`}
        footer={
          <button
            onClick={() => {
              setConfirmation(null);
              setCode('');
              clearVerifier();
            }}
            className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            Use a different number
          </button>
        }
      >
        <FormError message={error} />
        {info && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
            {info}
          </div>
        )}

        <form onSubmit={verify} className="space-y-4">
          <div>
            <label className="label" htmlFor="code">One-time password</label>
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
            {busy ? 'Verifying…' : 'Verify and create account'}
          </button>
        </form>

        <button
          onClick={resend}
          disabled={seconds > 0 || busy}
          className="mt-4 w-full text-center text-sm font-semibold text-brand-600 disabled:text-slate-400 hover:underline dark:text-brand-400"
        >
          {seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
        </button>

        <div id={RECAPTCHA_CONTAINER_ID} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Takes under a minute. We will text a one-time password to verify your number."
      footer={
        <>
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Log in
          </Link>
        </>
      }
    >
      <FormError message={error} />

      <form onSubmit={sendCode} className="space-y-4">
        <div>
          <span className="label">I am a…</span>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={`rounded-xl border px-2 py-3 text-center transition ${
                  role === r.value
                    ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                }`}
              >
                <span className="block text-xl">{r.icon}</span>
                <span className="mt-1 block text-xs font-semibold">{r.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{ROLES.find((r) => r.value === role)?.hint}</p>
        </div>

        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" required value={form.name} onChange={set('name')} className="input" placeholder="Your name" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required value={form.email} onChange={set('email')} className="input" placeholder="you@example.com" />
          </div>
          <div>
            <label className="label" htmlFor="phone">Mobile number</label>
            <input
              id="phone"
              required
              inputMode="numeric"
              value={form.phone}
              onChange={set('phone')}
              className="input"
              placeholder="10-digit mobile"
              autoComplete="tel"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={6} value={form.password} onChange={set('password')} className="input" placeholder="At least 6 characters" autoComplete="new-password" />
        </div>

        {role === 'mechanic' && (
          <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-sm font-semibold">Mechanic verification</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="exp">Years of experience</label>
                <input id="exp" type="number" min={0} max={50} value={form.experienceYears} onChange={set('experienceYears')} className="input" placeholder="5" />
              </div>
              <div>
                <label className="label" htmlFor="dl">Driving licence no.</label>
                <input id="dl" value={form.drivingLicenceNumber} onChange={set('drivingLicenceNumber')} className="input" placeholder="TS0123456789" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="idp">ID proof (Aadhaar) number</label>
              <input id="idp" value={form.idProofNumber} onChange={set('idProofNumber')} className="input" placeholder="XXXX XXXX XXXX" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              An admin reviews these details before your account can take jobs.
            </p>
          </div>
        )}

        {role === 'vendor' && (
          <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-800">
            <div>
              <label className="label" htmlFor="shop">Shop name</label>
              <input id="shop" value={form.shopName} onChange={set('shopName')} className="input" placeholder="Sai Auto Spares" />
            </div>
            <div>
              <label className="label" htmlFor="gst">GST number</label>
              <input id="gst" value={form.gstNumber} onChange={set('gstNumber')} className="input" placeholder="36ABCDE1234F1Z5" />
            </div>
          </div>
        )}

        <div>
          <label className="label" htmlFor="ref">Referral code (optional)</label>
          <input id="ref" value={form.referredBy} onChange={set('referredBy')} className="input" placeholder="Get ₹100 wallet credit" />
        </div>

        <button type="submit" disabled={busy} className="btn-primary w-full py-3">
          {busy ? 'Sending code…' : 'Send verification code'}
        </button>
      </form>

      {/* Firebase renders the invisible reCAPTCHA challenge into this element. */}
      <div id={RECAPTCHA_CONTAINER_ID} />
    </AuthCard>
  );
}
