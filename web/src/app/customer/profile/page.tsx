'use client';

import { useEffect, useState } from 'react';
import { api, rupees } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { SectionTitle, Spinner } from '@/components/ui';
import type { MaintenancePrediction, Vehicle } from '@/lib/types';

const URGENCY_COLOUR: Record<string, string> = {
  overdue: 'bg-red-500',
  due_now: 'bg-amber-500',
  due_soon: 'bg-blue-500',
  ok: 'bg-emerald-500',
};

function VehicleForm({ vehicle, onDone }: { vehicle?: Vehicle; onDone: () => void }) {
  const { setUser } = useAuth();
  const { push } = useToast();
  const [form, setForm] = useState({
    make: vehicle?.make || '',
    model: vehicle?.model || '',
    year: vehicle?.year?.toString() || '',
    registrationNumber: vehicle?.registrationNumber || '',
    odometerKm: vehicle?.odometerKm?.toString() || '',
    lastServiceDate: vehicle?.lastServiceDate?.slice(0, 10) || '',
    lastServiceOdometerKm: vehicle?.lastServiceOdometerKm?.toString() || '',
  });
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        ...form,
        year: form.year ? Number(form.year) : undefined,
        odometerKm: form.odometerKm ? Number(form.odometerKm) : 0,
        lastServiceOdometerKm: form.lastServiceOdometerKm ? Number(form.lastServiceOdometerKm) : 0,
        lastServiceDate: form.lastServiceDate || undefined,
      };
      const res = vehicle
        ? await api<{ vehicles: Vehicle[] }>(`/profile/vehicles/${vehicle._id}`, { method: 'PATCH', body })
        : await api<{ vehicles: Vehicle[] }>('/profile/vehicles', { method: 'POST', body });

      setUser((current: any) => ({ ...current, vehicles: res.vehicles }));
      push(vehicle ? 'Vehicle updated' : 'Vehicle added', 'success');
      onDone();
    } catch (err: any) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Make</label>
          <input required value={form.make} onChange={set('make')} className="input" placeholder="Honda" />
        </div>
        <div>
          <label className="label">Model</label>
          <input required value={form.model} onChange={set('model')} className="input" placeholder="Activa 6G" />
        </div>
        <div>
          <label className="label">Registration number</label>
          <input required value={form.registrationNumber} onChange={set('registrationNumber')} className="input" placeholder="TS09EA1234" />
        </div>
        <div>
          <label className="label">Year</label>
          <input type="number" value={form.year} onChange={set('year')} className="input" placeholder="2022" />
        </div>
        <div>
          <label className="label">Current odometer (km)</label>
          <input type="number" value={form.odometerKm} onChange={set('odometerKm')} className="input" placeholder="14200" />
        </div>
        <div>
          <label className="label">Odometer at last service (km)</label>
          <input type="number" value={form.lastServiceOdometerKm} onChange={set('lastServiceOdometerKm')} className="input" placeholder="10400" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Last service date</label>
          <input type="date" value={form.lastServiceDate} onChange={set('lastServiceDate')} className="input" />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            The odometer and last service date drive the predictive maintenance forecast.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary text-sm">
          {busy ? 'Saving…' : vehicle ? 'Save changes' : 'Add vehicle'}
        </button>
        <button type="button" onClick={onDone} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function ProfilePage() {
  const { user, setUser, refresh } = useAuth();
  const { push } = useToast();
  const [editingVehicle, setEditingVehicle] = useState<string | null>(null);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [maintenance, setMaintenance] = useState<Record<string, { healthScore: number; dailyKm: number; predictions: MaintenancePrediction[] }>>({});
  const [profile, setProfile] = useState({ name: '', phone: '', emergencyName: '', emergencyPhone: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfile({
      name: user.name,
      phone: user.phone,
      emergencyName: user.emergencyContact?.name || '',
      emergencyPhone: user.emergencyContact?.phone || '',
    });
    user.vehicles.forEach((v) => {
      api<any>(`/profile/vehicles/${v._id}/maintenance`)
        .then((d) => setMaintenance((m) => ({ ...m, [v._id]: d })))
        .catch(() => {});
    });
  }, [user?._id, user?.vehicles?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { user: updated } = await api<{ user: any }>('/profile', {
        method: 'PATCH',
        body: {
          name: profile.name,
          phone: profile.phone,
          emergencyContact: { name: profile.emergencyName, phone: profile.emergencyPhone },
        },
      });
      setUser(updated);
      push('Profile updated', 'success');
    } catch (err: any) {
      push(err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const deleteVehicle = async (id: string) => {
    if (!window.confirm('Remove this vehicle from your profile?')) return;
    try {
      const res = await api<{ vehicles: Vehicle[] }>(`/profile/vehicles/${id}`, { method: 'DELETE' });
      setUser({ ...(user as any), vehicles: res.vehicles });
      push('Vehicle removed', 'info');
    } catch (err: any) {
      push(err.message, 'error');
    }
  };

  const makePrimary = async (id: string) => {
    const res = await api<{ vehicles: Vehicle[] }>(`/profile/vehicles/${id}`, { method: 'PATCH', body: { isPrimary: true } });
    setUser({ ...(user as any), vehicles: res.vehicles });
    push('Primary vehicle updated', 'success');
  };

  if (!user) return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section>
        <SectionTitle title="Your profile" />
        <div className="card">
          <div className="mb-5 flex items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
              style={{ background: user.avatarColor || '#2563eb' }}
            >
              {user.name.charAt(0)}
            </div>
            <div>
              <p className="text-lg font-bold">{user.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                <span className="badge bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Wallet {rupees(user.walletBalance)}
                </span>
                {user.referralCode && (
                  <span className="badge bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300">
                    Referral code {user.referralCode}
                  </span>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Full name</label>
              <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Emergency contact name</label>
              <input
                value={profile.emergencyName}
                onChange={(e) => setProfile({ ...profile, emergencyName: e.target.value })}
                className="input"
                placeholder="Who should we alert on SOS?"
              />
            </div>
            <div>
              <label className="label">Emergency contact phone</label>
              <input
                value={profile.emergencyPhone}
                onChange={(e) => setProfile({ ...profile, emergencyPhone: e.target.value })}
                className="input"
                placeholder="10-digit mobile"
              />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={savingProfile} className="btn-primary text-sm">
                {savingProfile ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section>
        <SectionTitle
          title="My vehicles"
          subtitle="Multiple bikes supported — the primary one is used for quick bookings"
          action={
            !addingVehicle && (
              <button onClick={() => setAddingVehicle(true)} className="btn-primary text-sm">
                + Add vehicle
              </button>
            )
          }
        />

        <div className="space-y-3">
          {addingVehicle && <VehicleForm onDone={() => setAddingVehicle(false)} />}

          {user.vehicles.length === 0 && !addingVehicle && (
            <div className="card text-center text-sm text-slate-500 dark:text-slate-400">
              No vehicles yet. Add your bike to book services and get maintenance predictions.
            </div>
          )}

          {user.vehicles.map((v) =>
            editingVehicle === v._id ? (
              <VehicleForm key={v._id} vehicle={v} onDone={() => setEditingVehicle(null)} />
            ) : (
              <div key={v._id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">🏍️</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">
                          {v.make} {v.model}
                        </h3>
                        {v.isPrimary && (
                          <span className="badge bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300">Primary</span>
                        )}
                      </div>
                      <p className="font-mono text-sm text-slate-500 dark:text-slate-400">{v.registrationNumber}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {v.year && `${v.year} · `}
                        {(v.odometerKm || 0).toLocaleString('en-IN')} km on the clock
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!v.isPrimary && (
                      <button onClick={() => makePrimary(v._id)} className="btn-secondary text-xs">
                        Make primary
                      </button>
                    )}
                    <button onClick={() => setEditingVehicle(v._id)} className="btn-secondary text-xs">
                      Edit
                    </button>
                    <button onClick={() => deleteVehicle(v._id)} className="btn-secondary text-xs text-red-600 dark:text-red-400">
                      Remove
                    </button>
                  </div>
                </div>

                {maintenance[v._id] && (
                  <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-bold">🔮 Predictive maintenance</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Health {maintenance[v._id].healthScore}/100 · you ride about {maintenance[v._id].dailyKm} km/day
                      </p>
                    </div>
                    <div className="space-y-2">
                      {maintenance[v._id].predictions.slice(0, 6).map((p) => (
                        <div key={p.key} className="flex items-center gap-3">
                          <span className="w-6 text-center">{p.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between gap-2 text-sm">
                              <span className="truncate font-medium">{p.label}</span>
                              <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                                {p.urgency === 'overdue' ? 'Overdue' : `${p.daysRemaining} days`} · {rupees(p.estimatedCost)}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div
                                className={`h-full rounded-full ${URGENCY_COLOUR[p.urgency]}`}
                                style={{ width: `${Math.min(100, p.wearPercent)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}
