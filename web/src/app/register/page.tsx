'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthCard, FormError } from '@/components/AuthCard';
import { api } from '@/lib/api';

const ROLES = [
  { value: 'customer', label: 'Customer', icon: '🧑', hint: 'Book services and buy parts' },
  { value: 'mechanic', label: 'Mechanic', icon: '🔧', hint: 'Accept jobs and earn' },
  { value: 'vendor', label: 'Vendor', icon: '🏪', hint: 'Sell spare parts' },
];

export default function RegisterPage() {
  const router = useRouter();
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
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

      const res = await api<{ devOtp?: string }>('/auth/register', {
        method: 'POST',
        auth: false,
        body: {
          ...form,
          role,
          experienceYears: form.experienceYears ? Number(form.experienceYears) : undefined,
          location: coordinates ? { coordinates } : undefined,
        },
      });

      const otpHint = res.devOtp ? `&devOtp=${res.devOtp}` : '';
      router.push(`/verify-otp?email=${encodeURIComponent(form.email)}${otpHint}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="Takes under a minute. We will send a one-time password to verify it."
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

      <form onSubmit={submit} className="space-y-4">
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
            <label className="label" htmlFor="phone">Phone</label>
            <input id="phone" required value={form.phone} onChange={set('phone')} className="input" placeholder="10-digit mobile" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={6} value={form.password} onChange={set('password')} className="input" placeholder="At least 6 characters" />
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
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthCard>
  );
}
