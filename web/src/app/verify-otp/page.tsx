'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthCard, FormError } from '@/components/AuthCard';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/types';

function VerifyOtpInner() {
  const params = useSearchParams();
  const { completeAuth } = useAuth();
  const email = params.get('email') || '';
  const [code, setCode] = useState(params.get('devOtp') || '');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(30);
  const [devMode, setDevMode] = useState<boolean | null>(null);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  // This screen only exists for accounts created by the older email-OTP signup.
  // Whether a code is actually obtainable depends on the server's DEV_MODE, so
  // ask rather than assert — the banner used to promise "123456" unconditionally,
  // which is a lie against a production backend that mails nothing.
  useEffect(() => {
    api<{ devMode: boolean }>('/auth/config', { auth: false })
      .then((c) => setDevMode(c.devMode))
      .catch(() => setDevMode(null));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ token: string; user: User }>('/auth/verify-otp', {
        method: 'POST',
        auth: false,
        body: { email, code },
      });
      completeAuth(res.token, res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      const res = await api<{ devOtp?: string }>('/auth/resend-otp', { method: 'POST', auth: false, body: { email } });
      setSeconds(30);
      setInfo(res.devOtp ? `Development mode: your OTP is ${res.devOtp}` : 'A new OTP has been sent.');
      if (res.devOtp) setCode(res.devOtp);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <AuthCard title="Verify your account" subtitle={`Enter the 6-digit code we sent to ${email || 'your email'}.`}>
      <FormError message={error} />
      {info && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          {info}
        </div>
      )}

      {devMode === true && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <strong>Development mode:</strong> no SMS gateway is connected, so the OTP is always{' '}
          <code className="font-mono font-bold">123456</code> and is printed in the backend console.
        </div>
      )}

      {devMode === false && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <strong>This is the old email sign-up.</strong> No mail provider is configured on the live
          server, so no code can reach you here.{' '}
          <Link href="/register" className="font-semibold underline">
            Sign up with your mobile number
          </Link>{' '}
          instead — that sends a real OTP by SMS.
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="code">One-time password</label>
          <input
            id="code"
            required
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="input text-center text-2xl font-bold tracking-[0.5em]"
            placeholder="······"
          />
        </div>

        <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full py-3">
          {busy ? 'Verifying…' : 'Verify and continue'}
        </button>
      </form>

      <button
        onClick={resend}
        disabled={seconds > 0}
        className="mt-4 w-full text-center text-sm font-semibold text-brand-600 disabled:text-slate-400 hover:underline dark:text-brand-400"
      >
        {seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
      </button>
    </AuthCard>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={null}>
      <VerifyOtpInner />
    </Suspense>
  );
}
