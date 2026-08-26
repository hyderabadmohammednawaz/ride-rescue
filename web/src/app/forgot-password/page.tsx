'use client';

import { useEffect, useState } from 'react';
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

const RESEND_SECONDS = 30;

/**
 * Password reset by mobile number.
 *
 * This used to email a one-time code. On a deployed server that could never
 * work: DEV_MODE is off, so the code went only to the server log, and no mail
 * provider is configured — the page promised "an OTP has been sent" and then
 * asked for a code that would never arrive, locking the user out for good.
 *
 * Firebase already proves ownership of a number for signing up and signing in,
 * and that same proof is what a reset needs, so the whole flow runs on SMS.
 */
export default function ForgotPasswordPage() {
  const { completeAuth } = useAuth();

  const [phone, setPhone] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      if (!isValidIndianMobile(phone)) {
        throw new Error('Enter a 10-digit Indian mobile number starting 6, 7, 8 or 9.');
      }
      setConfirmation(await sendOtp(phone));
      setSeconds(RESEND_SECONDS);
      setInfo(null);
    } catch (err: any) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmation) return;
    setError(null);
    setBusy(true);
    try {
      const idToken = await confirmOtp(confirmation, code);
      const res = await api<{ token: string; user: User }>('/auth/phone/reset-password', {
        method: 'POST',
        auth: false,
        body: { idToken, newPassword },
      });
      clearVerifier();
      completeAuth(res.token, res.user);
    } catch (err: any) {
      // 404 means the number is not registered — a signpost, not a failure.
      if (err.status === 404) {
        setError('No account uses that mobile number. Create one instead.');
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
      setInfo('A new code is on its way.');
    } catch (err: any) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title={confirmation ? 'Choose a new password' : 'Reset your password'}
      subtitle={
        confirmation
          ? `Enter the code we sent to ${toE164(phone)}, then pick a new password.`
          : 'We will text a one-time password to your registered mobile number.'
      }
      footer={
        <>
          Remembered it?{' '}
          <Link href="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Log in
          </Link>
        </>
      }
    >
      <FormError message={error} />
      {info && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          {info}
        </div>
      )}

      {!confirmation ? (
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
              autoFocus
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Use the number your account was created with.
            </p>
          </div>

          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy ? 'Sending code…' : 'Send code'}
          </button>
        </form>
      ) : (
        <>
          <form onSubmit={reset} className="space-y-4">
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

            <div>
              <label className="label" htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={busy || code.length !== 6 || newPassword.length < 6}
              className="btn-primary w-full py-3"
            >
              {busy ? 'Updating…' : 'Set new password'}
            </button>
          </form>

          <button
            onClick={resend}
            disabled={seconds > 0 || busy}
            className="mt-4 w-full text-center text-sm font-semibold text-brand-600 disabled:text-slate-400 hover:underline dark:text-brand-400"
          >
            {seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
          </button>

          <button
            onClick={() => {
              setConfirmation(null);
              setCode('');
              clearVerifier();
            }}
            className="mt-2 w-full text-center text-sm text-slate-500 hover:underline dark:text-slate-400"
          >
            Use a different number
          </button>
        </>
      )}

      {/* Firebase renders the invisible reCAPTCHA challenge into this element. */}
      <div id={RECAPTCHA_CONTAINER_ID} />
    </AuthCard>
  );
}
