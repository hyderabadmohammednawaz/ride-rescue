import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, rupees } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useCart } from '../../lib/cart';
import { Button, Card, Empty, Row } from '../../components/ui';
import { colors } from '../../lib/theme';

interface Quote {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
}

/**
 * Cart and checkout.
 *
 * The totals shown here come from POST /orders/quote rather than being summed
 * on the device: delivery thresholds and coupon rules live on the server, and
 * the order is priced there again at checkout. A price computed on the phone
 * would only ever be a guess that sometimes disagreed with the bill.
 */
export default function CartScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { lines, setQuantity, remove, clear, subtotal } = useCart();

  const [coupon, setCoupon] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [address, setAddress] = useState(user?.location?.address || '');
  const [busy, setBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const priceIt = useCallback(
    async (code?: string) => {
      if (lines.length === 0) {
        setQuote(null);
        return;
      }
      try {
        const res = await api<Quote>('/orders/quote', {
          method: 'POST',
          body: {
            items: lines.map((l) => ({ partId: l.partId, quantity: l.quantity })),
            couponCode: code || undefined,
          },
        });
        setQuote(res);
        setCouponError(null);
      } catch (err: any) {
        setCouponError(err.message);
      }
    },
    [lines]
  );

  useEffect(() => {
    priceIt(coupon || undefined);
    // Re-price whenever the contents change; the coupon is applied explicitly.
  }, [lines]); // eslint-disable-line react-hooks/exhaustive-deps

  const placeOrder = async () => {
    if (!address.trim()) {
      Alert.alert('Delivery address needed', 'Where should the parts be delivered?');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ order: { _id: string; reference: string } }>('/orders', {
        method: 'POST',
        body: {
          items: lines.map((l) => ({ partId: l.partId, quantity: l.quantity })),
          deliveryAddress: address.trim(),
          couponCode: coupon.trim() || undefined,
        },
      });
      clear();
      Alert.alert('Order placed', `Reference ${res.order.reference}. Pay for it from My orders.`, [
        { text: 'View orders', onPress: () => router.replace('/customer/orders') },
      ]);
    } catch (err: any) {
      Alert.alert('Could not place order', err.message);
    } finally {
      setBusy(false);
    }
  };

  if (lines.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <Empty icon="🛒" title="Your cart is empty" hint="Browse the store and add the parts you need." />
          <Button label="Browse spare parts" onPress={() => router.replace('/customer/store')} style={{ marginTop: 12 }} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {lines.map((l) => (
        <Card key={l.partId} style={{ marginBottom: 10 }}>
          <View style={styles.lineTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{l.name}</Text>
              <Text style={styles.unit}>
                {rupees(l.price)} each · {l.stock} in stock
              </Text>
            </View>
            <Text style={styles.lineTotal}>{rupees(l.price * l.quantity)}</Text>
          </View>

          <View style={styles.qtyRow}>
            <View style={styles.stepper}>
              <Pressable onPress={() => setQuantity(l.partId, l.quantity - 1)} hitSlop={8} style={styles.stepBtn}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.qty}>{l.quantity}</Text>
              <Pressable
                onPress={() => setQuantity(l.partId, l.quantity + 1)}
                hitSlop={8}
                style={[styles.stepBtn, l.quantity >= l.stock && styles.stepDisabled]}
                disabled={l.quantity >= l.stock}
              >
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => remove(l.partId)} hitSlop={8}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        </Card>
      ))}

      <Card style={{ marginTop: 6 }}>
        <Text style={styles.cardTitle}>Coupon</Text>
        <View style={styles.couponRow}>
          <TextInput
            value={coupon}
            onChangeText={(t) => setCoupon(t.toUpperCase())}
            placeholder="RIDE10"
            placeholderTextColor="#94a3b8"
            autoCapitalize="characters"
            style={[styles.input, { flex: 1 }]}
          />
          <Button label="Apply" variant="secondary" onPress={() => priceIt(coupon)} />
        </View>
        {couponError ? <Text style={styles.error}>{couponError}</Text> : null}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Delivery address</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Flat, street, area, city"
          placeholderTextColor="#94a3b8"
          multiline
          style={[styles.input, { minHeight: 76, textAlignVertical: 'top' }]}
        />
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Summary</Text>
        <Row label="Subtotal" value={rupees(quote?.subtotal ?? subtotal)} />
        {quote && quote.discount > 0 ? <Row label="Discount" value={`− ${rupees(quote.discount)}`} /> : null}
        <Row
          label="Delivery"
          value={quote ? (quote.deliveryFee === 0 ? 'Free' : rupees(quote.deliveryFee)) : '—'}
        />
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{rupees(quote?.total ?? subtotal)}</Text>
        </View>
        <Text style={styles.serverNote}>Priced by the server — the same figures appear on your invoice.</Text>
      </Card>

      <Button label="Place order" onPress={placeOrder} loading={busy} style={{ marginTop: 16 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  lineTop: { flexDirection: 'row', gap: 12 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  unit: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  lineTotal: { fontSize: 15, fontWeight: '800', color: colors.text },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  stepDisabled: { opacity: 0.4 },
  stepText: { fontSize: 18, fontWeight: '800', color: colors.text },
  qty: { fontSize: 15, fontWeight: '800', color: colors.text, minWidth: 20, textAlign: 'center' },
  removeText: { fontSize: 13, fontWeight: '700', color: colors.danger },

  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 10 },
  couponRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#fff',
  },
  error: { fontSize: 12.5, color: colors.danger, marginTop: 8 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 16, fontWeight: '900', color: colors.text },
  totalValue: { fontSize: 16, fontWeight: '900', color: colors.text },
  serverNote: { fontSize: 11.5, color: colors.textMuted, marginTop: 8 },
});
