'use client';

import { useEffect, useState } from 'react';
import { api, formatDateTime, rupees } from '@/lib/api';
import { EmptyState, SectionTitle, Spinner, StatusBadge, Stars } from '@/components/ui';
import type { Booking } from '@/lib/types';

type Job = Booking & { review?: { rating: number; comment?: string; tags?: string[] } | null };

export default function MechanicHistoryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ jobs: Job[] }>('/mechanic/history').then((d) => {
      setJobs(d.jobs);
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <SectionTitle title="Service history" subtitle="Every job you have closed, with the rating the customer left" />

      {jobs.length === 0 ? (
        <EmptyState icon="📜" title="No completed jobs yet" hint="Jobs you finish will be listed here with customer feedback." />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job._id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{job.serviceType?.icon || '🔧'}</span>
                  <div>
                    <h3 className="font-bold">{job.serviceType?.name}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {job.customer?.name} · {job.vehicle.make} {job.vehicle.model}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono">{job.reference}</span> · {formatDateTime(job.completedAt || job.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold">{rupees(job.charges.labour + job.charges.visitFee)}</p>
                  <div className="mt-1 flex justify-end gap-1.5">
                    <StatusBadge status={job.status} />
                    <StatusBadge status={job.paymentStatus} />
                  </div>
                </div>
              </div>

              {job.review && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <Stars value={job.review.rating} />
                    <span className="text-sm font-semibold">{job.review.rating}/5</span>
                  </div>
                  {job.review.comment && <p className="mt-1.5 text-sm italic text-slate-700 dark:text-slate-300">"{job.review.comment}"</p>}
                  {job.review.tags && job.review.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {job.review.tags.map((t) => (
                        <span key={t} className="rounded-lg bg-white px-2 py-0.5 text-xs dark:bg-slate-900">
                          {t}
                        </span>
                      ))}
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
