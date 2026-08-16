'use client';

import { useEffect, useState } from 'react';
import { api, formatDateTime, rupees } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { useToast } from '@/components/Toast';
import { EmptyState, SectionTitle, Spinner, StatusBadge } from '@/components/ui';
import type { Order } from '@/lib/types';

const NEXT_ACTION: Record<string, { status: string; label: string; needsNote?: boolean }> = {
  placed: { status: 'accepted', label: 'Accept order' },
  accepted: { status: 'dispatched', label: 'Mark dispatched', needsNote: true },
  dispatched: { status: 'delivered', label: 'Mark delivered' },
};

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'New', value: 'placed' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Dispatched', value: 'dispatched' },
  { label: 'Delivered', value: 'delivered' },
];

export default function VendorOrdersPage() {
  const { push } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (status: string) => {
    const { orders } = await api<{ orders: Order[] }>(`/orders${status ? `?status=${status}` : ''}`);
    setOrders(orders);
    setLoading(false);
  };

  useEffect(() => {
    load(filter);
  }, [filter]);

  useSocketEvent('order:new', () => {
    push('New order received', 'success');
    load(filter);
  });

  const advance = async (order: Order) => {
    const action = NEXT_ACTION[order.status];
    if (!action) return;

    let note: string | undefined;
    if (action.needsNote) {
      note = window.prompt('Add a tracking note for the customer (optional)', 'Handed to our delivery partner') ?? undefined;
    }

    setBusy(order._id);
    try {
      await api(`/orders/${order._id}/status`, { method: 'PATCH', body: { status: action.status, note } });
      push(`Order ${order.reference} → ${action.status}`, 'success');
      load(filter);
    } catch (err: any) {
      push(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (order: Order) => {
    if (!window.confirm(`Cancel order ${order.reference}? Stock will be returned to your inventory.`)) return;
    try {
      await api(`/orders/${order._id}/status`, { method: 'PATCH', body: { status: 'cancelled', note: 'Cancelled by vendor' } });
      push('Order cancelled and stock restored', 'info');
      load(filter);
    } catch (err: any) {
      push(err.message, 'error');
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <SectionTitle title="Orders" subtitle="Only the items you supply are shown for each order" />

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

      {orders.length === 0 ? (
        <EmptyState icon="📦" title="No orders here" hint="Orders containing your products will appear here instantly." />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const action = NEXT_ACTION[order.status];
            return (
              <div key={order._id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono font-semibold">{order.reference}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {(order.customer as any)?.name} · {(order.customer as any)?.phone}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(order.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={order.status} />
                    <StatusBadge status={order.paymentStatus} />
                  </div>
                </div>

                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="text-xl">{(item.part as any)?.image || '🔩'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{item.sku}</p>
                      </div>
                      <span className="text-slate-600 dark:text-slate-400">× {item.quantity}</span>
                      <span className="w-20 text-right font-semibold">{rupees(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">🚚 {order.deliveryAddress}</p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Your share of this order</p>
                    <p className="text-lg font-bold">{rupees(order.vendorSubtotal ?? order.subtotal)}</p>
                  </div>
                  <div className="flex gap-2">
                    {['placed', 'accepted'].includes(order.status) && (
                      <button onClick={() => cancel(order)} className="btn-secondary text-sm text-red-600 dark:text-red-400">
                        Cancel
                      </button>
                    )}
                    {action && (
                      <button onClick={() => advance(order)} disabled={busy === order._id} className="btn-primary text-sm">
                        {busy === order._id ? 'Updating…' : action.label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
