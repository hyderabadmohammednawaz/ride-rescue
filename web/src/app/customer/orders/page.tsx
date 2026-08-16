'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, formatDateTime, rupees } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocketEvent } from '@/lib/socket';
import { PaymentDialog } from '@/components/PaymentDialog';
import { EmptyState, SectionTitle, Spinner, StatusBadge } from '@/components/ui';
import type { Order } from '@/lib/types';

const TRACK_STEPS = ['placed', 'accepted', 'dispatched', 'delivered'];

export default function OrdersPage() {
  const { user, refresh } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<Order | null>(null);

  const load = async () => {
    const { orders } = await api<{ orders: Order[] }>('/orders');
    setOrders(orders);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useSocketEvent<Order>('order:updated', (updated) => {
    setOrders((current) => current.map((o) => (o._id === updated._id ? { ...o, ...updated } : o)));
  });

  if (loading) return <Spinner />;

  if (orders.length === 0) {
    return (
      <EmptyState
        icon="📦"
        title="No orders yet"
        hint="Spare parts you order will show up here with live delivery tracking."
        action={
          <Link href="/customer/store" className="btn-primary">
            Browse the store
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <SectionTitle title="My orders" subtitle="Track your spare parts from the vendor to your door" />

      <div className="space-y-4">
        {orders.map((order) => {
          const step = TRACK_STEPS.indexOf(order.status);
          return (
            <div key={order._id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold">{order.reference}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(order.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={order.status} />
                  <StatusBadge status={order.paymentStatus} />
                </div>
              </div>

              {order.status !== 'cancelled' && (
                <div className="my-4 flex items-center">
                  {TRACK_STEPS.map((s, i) => (
                    <div key={s} className="flex flex-1 items-center last:flex-none">
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                            i <= step ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                          }`}
                        >
                          {i <= step ? '✓' : i + 1}
                        </div>
                        <span className={`text-[10px] capitalize ${i <= step ? 'font-semibold' : 'text-slate-400'}`}>{s}</span>
                      </div>
                      {i < TRACK_STEPS.length - 1 && (
                        <div className={`mx-1 h-0.5 flex-1 ${i < step ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'}`} />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                {order.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-xl">{item.part?.image || '🔩'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Qty {item.quantity}
                        {item.warrantyMonths > 0 && ` · ${item.warrantyMonths} mo warranty`}
                      </p>
                    </div>
                    <span className="font-semibold">{rupees(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              {order.trackingNote && (
                <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-500/10 dark:text-blue-300">
                  📍 {order.trackingNote}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Delivering to <span className="font-medium text-slate-900 dark:text-slate-200">{order.deliveryAddress}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">{rupees(order.total)}</span>
                  {order.paymentStatus === 'unpaid' && order.status !== 'cancelled' && (
                    <button onClick={() => setPaying(order)} className="btn-primary text-sm">
                      Pay now
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {paying && (
        <PaymentDialog
          amount={paying.total}
          purpose="order"
          orderId={paying._id}
          walletBalance={user?.walletBalance || 0}
          onPaid={async () => {
            await load();
            await refresh();
          }}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
}
