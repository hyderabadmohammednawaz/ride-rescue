import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, formatDateTime, rupees } from '../../lib/api';
import { Button, Card, Empty, Loading, Row, StatusBadge } from '../../components/ui';
import {
  RazorpayCheckout,
  type CheckoutOptions,
  type CheckoutResult,
} from '../../components/RazorpayCheckout';
import { colors } from '../../lib/theme';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  _id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  total: number;
  subtotal?: number;
  discount?: number;
  deliveryFee?: number;
  items: OrderItem[];
  deliveryAddress?: string;
  createdAt: string;
}

export default function OrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState<{ paymentId: string; options: CheckoutOptions } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ orders: Order[] }>('/orders?limit=50');
      setOrders(res.orders || []);
    } catch {
      setOrders([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const settle = useCallback(
    async (paymentId: string, body: object) => {
      await api(`/payments/${paymentId}/confirm`, { method: 'POST', body });
      Alert.alert('Payment successful', 'Your order is paid.');
      await load();
    },
    [load]
  );

  const pay = async (order: Order, method: string) => {
    setBusy(true);
    try {
      const created = await api<{
        payment: { _id: string };
        gateway: string;
        checkout: CheckoutOptions;
      }>('/payments/create', {
        method: 'POST',
        body: { purpose: 'order', orderId: order._id, method, supportsCheckout: true },
      });

      if (created.gateway === 'razorpay') {
        setCheckout({ paymentId: created.payment._id, options: created.checkout });
        return;
      }
      await settle(created.payment._id, {});
    } catch (err: any) {
      Alert.alert('Payment failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  const onResult = async (result: CheckoutResult) => {
    const pending = checkout;
    setCheckout(null);
    if (!pending) return;
    setBusy(true);
    try {
      await settle(pending.paymentId, result);
    } catch (err: any) {
      Alert.alert('Payment failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!orders) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        {orders.length === 0 ? (
          <Card>
            <Empty icon="📦" title="No orders yet" hint="Parts you buy from the store will appear here." />
            <Button
              label="Browse spare parts"
              onPress={() => router.replace('/customer/store')}
              style={{ marginTop: 12 }}
            />
          </Card>
        ) : (
          orders.map((o) => (
            <Card key={o._id} style={{ marginBottom: 12 }}>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ref}>{o.reference}</Text>
                  <Text style={styles.date}>{formatDateTime(o.createdAt)}</Text>
                </View>
                <StatusBadge status={o.status} />
              </View>

              <View style={styles.divider} />

              {o.items.map((it, i) => (
                <View key={`${o._id}-${i}`} style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {it.name} × {it.quantity}
                  </Text>
                  <Text style={styles.itemPrice}>{rupees(it.price * it.quantity)}</Text>
                </View>
              ))}

              <View style={styles.divider} />
              {o.discount ? <Row label="Discount" value={`− ${rupees(o.discount)}`} /> : null}
              <Row
                label="Delivery"
                value={o.deliveryFee === 0 ? 'Free' : rupees(o.deliveryFee || 0)}
              />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{rupees(o.total)}</Text>
              </View>

              {o.deliveryAddress ? <Text style={styles.address}>🚚 {o.deliveryAddress}</Text> : null}

              {o.paymentStatus === 'paid' ? (
                <View style={styles.paidTag}>
                  <Text style={styles.paidText}>✓ PAID</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.payHint}>Choose how to pay</Text>
                  <View style={styles.payRow}>
                    <Button label="📲 UPI" onPress={() => pay(o, 'upi')} disabled={busy} style={{ flex: 1 }} />
                    <Button
                      label="💳 Card"
                      variant="secondary"
                      onPress={() => pay(o, 'card')}
                      disabled={busy}
                      style={{ flex: 1 }}
                    />
                  </View>
                </>
              )}
            </Card>
          ))
        )}
      </ScrollView>

      <RazorpayCheckout
        options={checkout?.options ?? null}
        onResult={onResult}
        onDismiss={() => setCheckout(null)}
        onError={(message) => {
          setCheckout(null);
          Alert.alert('Payment not completed', message);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ref: { fontSize: 15, fontWeight: '800', color: colors.text },
  date: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
  itemName: { fontSize: 13.5, color: colors.text, flex: 1 },
  itemPrice: { fontSize: 13.5, color: colors.text, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  totalLabel: { fontSize: 15, fontWeight: '900', color: colors.text },
  totalValue: { fontSize: 15, fontWeight: '900', color: colors.text },
  address: { fontSize: 12.5, color: colors.textMuted, marginTop: 10 },
  paidTag: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: colors.successLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  paidText: { fontSize: 12, fontWeight: '800', color: '#065f46', letterSpacing: 0.5 },
  payHint: { fontSize: 12.5, color: colors.textMuted, marginTop: 12 },
  payRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
