'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, timeAgo } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { useToast } from './Toast';
import type { NotificationItem } from '@/lib/types';

const TYPE_ICON: Record<string, string> = {
  booking: '🔧',
  order: '📦',
  payment: '💳',
  chat: '💬',
  sos: '🚨',
  reminder: '⏰',
  system: '🔔',
};

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { push } = useToast();

  const load = async () => {
    try {
      const data = await api<{ notifications: NotificationItem[]; unreadCount: number }>('/notifications');
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      /* not signed in yet */
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Live push from the server replaces polling.
  useSocketEvent<NotificationItem>('notification', (n) => {
    setItems((current) => [n, ...current].slice(0, 40));
    setUnread((c) => c + 1);
    push(n.title, n.type === 'sos' ? 'error' : 'info');
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markAllRead = async () => {
    await api('/notifications/read', { method: 'POST', body: {} });
    setItems((c) => c.map((n) => ({ ...n, read: true })));
    setUnread(0);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 animate-slideUp overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h3 className="font-semibold">Notifications</h3>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Nothing yet</p>
            ) : (
              items.map((n) => (
                <button
                  key={n._id}
                  onClick={() => {
                    setOpen(false);
                    if (n.link) router.push(n.link);
                  }}
                  className={`flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/60 ${
                    n.read ? '' : 'bg-brand-50/60 dark:bg-brand-500/5'
                  }`}
                >
                  <span className="text-lg">{TYPE_ICON[n.type] || '🔔'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
