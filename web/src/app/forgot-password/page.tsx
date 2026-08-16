'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthCard, FormError } from '@/components/AuthCard';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/types';

export default function ForgotPasswordPage() {
  const { completeAuth } = useAuth();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ devOtp?: string }>('/auth/forgot-password', { method: 'POST', auth: false, body: { email } });
      if (res.devOtp) setCode(res.devOtp);
      setStep('reset');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ token: string; user: User }>('/auth/reset-password', {
        method: 'POST',
        auth: false,
        body: { email, code, newPassword },
      });
      completeAuth(res.token, res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title={step === 'request' ? 'Reset your password' : 'Choose a new password'}
      subtitle={
        step === 'request'
          ? 'We will send a one-time password to your registered email.'
          : `Enter the code sent to ${email} and pick a new password.`
      }
      footer={
        <Link href="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
          Back to log in
        </Link>
      }
    >
      <FormError message={error} />

      {step === 'request' ? (
        <form onSubmit={request} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy ? 'Sending…' : 'Send OTP'}
          </button>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-4">
          <div>
            <label className="label" htmlFor="code">One-time password</label>
            <input
              id="code"
              required
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="input text-center text-xl font-bold tracking-[0.4em]"
              placeholder="······"
            />
          </div>
          <div>
            <label className="label" htmlFor="pw">New password</label>
            <input id="pw" type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" placeholder="At least 6 characters" />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy ? 'Updating…' : 'Reset password'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
