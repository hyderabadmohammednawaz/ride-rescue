'use client';

import { useEffect, useState } from 'react';
import { api, rupees } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { SectionTitle, Spinner, Stars } from '@/components/ui';

export default function MechanicProfilePage() {
  const { user, setUser } = useAuth();
  const { push } = useToast();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    experienceYears: '',
    specialisations: '',
    serviceRadiusKm: '',
    hourlyRate: '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name,
      phone: user.phone,
      experienceYears: String(user.mechanicProfile?.experienceYears ?? ''),
      specialisations: (user.mechanicProfile?.specialisations || []).join(', '),
      serviceRadiusKm: String(user.mechanicProfile?.serviceRadiusKm ?? ''),
      hourlyRate: String(user.mechanicProfile?.hourlyRate ?? ''),
    });
  }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { user: updated } = await api<{ user: any }>('/profile', {
        method: 'PATCH',
        body: {
          name: form.name,
          phone: form.phone,
          mechanicProfile: {
            experienceYears: Number(form.experienceYears) || 0,
            specialisations: form.specialisations.split(',').map((s) => s.trim()).filter(Boolean),
            serviceRadiusKm: Number(form.serviceRadiusKm) || 15,
            hourlyRate: Number(form.hourlyRate) || 250,
          },
        },
      });
      setUser(updated);
      push('Profile updated', 'success');
    } catch (err: any) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <Spinner />;

  const profile = user.mechanicProfile;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionTitle title="Your mechanic profile" subtitle="These details feed the AI ranking that assigns you jobs" />

      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
            style={{ background: user.avatarColor || '#2563eb' }}
          >
            {user.name.charAt(0)}
          </div>
          <div className="flex-1">
            <p className="text-lg font-bold">{user.name}</p>
            <div className="mt-0.5 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Stars value={profile?.ratingAverage || 0} />
              <span>
                {(profile?.ratingAverage || 0).toFixed(1)} from {profile?.ratingCount || 0} ratings
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className={`badge ${
                  profile?.documentsVerified
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                }`}
              >
                {profile?.documentsVerified ? '✓ Documents verified' : '⏳ Verification pending'}
              </span>
              <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {profile?.completedJobs || 0} jobs completed
              </span>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={save} className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Full name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Years of experience</label>
            <input
              type="number"
              min={0}
              value={form.experienceYears}
              onChange={(e) => setForm({ ...form, experienceYears: e.target.value })}
              className="input"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Contributes to your AI match score.</p>
          </div>
          <div>
            <label className="label">Service radius (km)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={form.serviceRadiusKm}
              onChange={(e) => setForm({ ...form, serviceRadiusKm: e.target.value })}
              className="input"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">How far you are willing to ride for a job.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Specialisations</label>
            <input
              value={form.specialisations}
              onChange={(e) => setForm({ ...form, specialisations: e.target.value })}
              className="input"
              placeholder="Honda, Electrical, Engine overhaul"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Comma separated. Matching a customer's bike make gives you a ranking boost.
            </p>
          </div>
          <div>
            <label className="label">Hourly rate ({rupees(Number(form.hourlyRate) || 0)})</label>
            <input
              type="number"
              min={0}
              value={form.hourlyRate}
              onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
              className="input"
            />
          </div>
        </div>

        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}
