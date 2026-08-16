'use client';

import { useEffect, useState } from 'react';
import { api, formatDateTime } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { SectionTitle, Spinner, Stars } from '@/components/ui';
import type { User } from '@/lib/types';

const ROLE_TABS = [
  { label: 'All', value: '' },
  { label: 'Customers', value: 'customer' },
  { label: 'Mechanics', value: 'mechanic' },
  { label: 'Vendors', value: 'vendor' },
];

export default function AdminUsersPage() {
  const { push } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (role) params.set('role', role);
    if (q) params.set('q', q);
    const { users } = await api<{ users: User[] }>(`/admin/users?${params}`);
    setUsers(users);
    setLoading(false);
  };

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [role, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = async (user: User, body: Record<string, unknown>, message: string) => {
    try {
      const { user: updated } = await api<{ user: User }>(`/admin/users/${user._id}`, { method: 'PATCH', body });
      setUsers((current) => current.map((u) => (u._id === updated._id ? updated : u)));
      push(message, 'success');
    } catch (err: any) {
      push(err.message, 'error');
    }
  };

  const toggleBlock = (user: User) => {
    if (!user.isBlocked) {
      const reason = window.prompt(`Block ${user.name}? Give a reason (shown to them):`);
      if (reason === null) return;
      update(user, { isBlocked: true, reason }, `${user.name} has been blocked`);
    } else {
      update(user, { isBlocked: false }, `${user.name} has been unblocked`);
    }
  };

  return (
    <div>
      <SectionTitle title="Manage users" subtitle="Verify mechanics, block fake accounts and review activity" />

      <div className="mb-4 flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or phone…" className="input max-w-sm" />
        <div className="flex gap-2">
          {ROLE_TABS.map((t) => (
            <button
              key={t.label}
              onClick={() => setRole(t.value)}
              className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                role === t.value
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="pb-3">User</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Details</th>
                <th className="pb-3">Joined</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className={`border-b border-slate-50 dark:border-slate-800/60 ${u.isBlocked ? 'opacity-60' : ''}`}>
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ background: u.avatarColor || '#2563eb' }}
                      >
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{u.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <span className="badge bg-slate-100 capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">{u.role}</span>
                  </td>
                  <td className="py-3 text-xs text-slate-600 dark:text-slate-400">
                    {u.role === 'mechanic' && u.mechanicProfile && (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1">
                          <Stars value={u.mechanicProfile.ratingAverage} />
                          <span>({u.mechanicProfile.ratingCount})</span>
                        </div>
                        <p>
                          {u.mechanicProfile.experienceYears} yrs · {u.mechanicProfile.completedJobs} jobs
                        </p>
                        <p>{u.mechanicProfile.isAvailable ? '🟢 Online' : '⚪ Offline'}</p>
                      </div>
                    )}
                    {u.role === 'vendor' && <p>{u.vendorProfile?.shopName}</p>}
                    {u.role === 'customer' && <p>{u.vehicles?.length || 0} vehicle(s)</p>}
                  </td>
                  <td className="py-3 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(u.createdAt)}</td>
                  <td className="py-3">
                    <div className="flex flex-col gap-1">
                      {u.isBlocked ? (
                        <span className="badge bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">Blocked</span>
                      ) : (
                        <span className="badge bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">Active</span>
                      )}
                      {u.role === 'mechanic' && (
                        <span
                          className={`badge ${
                            u.mechanicProfile?.documentsVerified
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                          }`}
                        >
                          {u.mechanicProfile?.documentsVerified ? 'Verified' : 'Unverified'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      {u.role === 'mechanic' && !u.mechanicProfile?.documentsVerified && (
                        <button
                          onClick={() => update(u, { documentsVerified: true }, `${u.name} verified`)}
                          className="btn-secondary px-2.5 py-1 text-xs"
                        >
                          Verify
                        </button>
                      )}
                      <button
                        onClick={() => toggleBlock(u)}
                        className={`btn-secondary px-2.5 py-1 text-xs ${u.isBlocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                      >
                        {u.isBlocked ? 'Unblock' : 'Block'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No users match that search</p>}
        </div>
      )}
    </div>
  );
}
