'use client';

import { useEffect, useState } from 'react';
import { api, formatDateTime } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { EmptyState, SectionTitle, Spinner, StatusBadge } from '@/components/ui';

interface Complaint {
  _id: string;
  raisedBy: { name: string; email: string; role: string };
  against?: { name: string; email: string; role: string };
  booking?: { reference: string };
  subject: string;
  details?: string;
  status: 'open' | 'in_review' | 'resolved';
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'In review', value: 'in_review' },
  { label: 'Resolved', value: 'resolved' },
];

export default function ComplaintsPage() {
  const { push } = useToast();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');

  const load = async () => {
    setLoading(true);
    const { complaints } = await api<{ complaints: Complaint[] }>(`/admin/complaints${filter ? `?status=${filter}` : ''}`);
    setComplaints(complaints);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = async (id: string, body: Record<string, unknown>, message: string) => {
    try {
      await api(`/admin/complaints/${id}`, { method: 'PATCH', body });
      push(message, 'success');
      setResolvingId(null);
      setResolution('');
      load();
    } catch (err: any) {
      push(err.message, 'error');
    }
  };

  return (
    <div>
      <SectionTitle title="Complaint management" subtitle="Resolve disputes and act on reports of fake or abusive users" />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilter(f.value)}
            className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
              filter === f.value
                ? 'bg-brand-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : complaints.length === 0 ? (
        <EmptyState icon="✅" title="Nothing to resolve" hint="Complaints raised by customers or mechanics will appear here." />
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => (
            <div key={c._id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{c.subject}</h3>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                    Raised by <strong>{c.raisedBy?.name}</strong> ({c.raisedBy?.role})
                    {c.against && (
                      <>
                        {' '}against <strong>{c.against.name}</strong> ({c.against.role})
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {formatDateTime(c.createdAt)}
                    {c.booking && ` · booking ${c.booking.reference}`}
                  </p>
                </div>
                <StatusBadge status={c.status} />
              </div>

              {c.details && (
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">{c.details}</p>
              )}

              {c.resolution && (
                <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <strong>Resolution:</strong> {c.resolution}
                  {c.resolvedAt && <span className="ml-1 text-xs">({formatDateTime(c.resolvedAt)})</span>}
                </p>
              )}

              {c.status !== 'resolved' && (
                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {resolvingId === c._id ? (
                    <div className="space-y-2">
                      <textarea
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        rows={2}
                        className="input"
                        placeholder="What action did you take? This is sent to the complainant."
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => update(c._id, { status: 'resolved', resolution }, 'Complaint resolved')}
                          disabled={!resolution.trim()}
                          className="btn-primary text-sm"
                        >
                          Mark resolved
                        </button>
                        <button onClick={() => setResolvingId(null)} className="btn-secondary text-sm">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {c.status === 'open' && (
                        <button onClick={() => update(c._id, { status: 'in_review' }, 'Marked as in review')} className="btn-secondary text-sm">
                          Start review
                        </button>
                      )}
                      <button onClick={() => setResolvingId(c._id)} className="btn-primary text-sm">
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
