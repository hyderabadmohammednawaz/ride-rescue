import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, formatDateTime, rupees } from '../../lib/api';
import { useSocketEvent } from '../../lib/socket';
import { Card, Empty, Loading, StatusBadge } from '../../components/ui';
import { colors } from '../../lib/theme';

interface Booking {
  _id: string;
  reference: string;
  status: string;
  kind: string;
  paymentStatus: string;
  charges: { total: number };
  vehicle: { make: string; model: string };
  serviceType?: { name: string; icon: string };
  mechanic?: { name: string } | null;
  createdAt: string;
}

export default function BookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { bookings } = await api<{ bookings: Booking[] }>('/bookings');
    setBookings(bookings);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent<Booking>('booking:updated', (updated) =>
    setBookings((current) => current.map((b) => (b._id === updated._id ? updated : b)))
  );

  if (loading) return <Loading />;

  if (bookings.length === 0) {
    return <Empty icon="🔧" title="No bookings yet" hint="Raise an SOS or book a service from the home screen." />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      {bookings.map((b) => (
        <Pressable key={b._id} onPress={() => router.push(`/customer/booking/${b._id}`)}>
          <Card style={{ marginBottom: 10 }}>
            <View style={styles.row}>
              <Text style={styles.icon}>{b.serviceType?.icon || '🔧'}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{b.serviceType?.name || 'Service'}</Text>
                  {b.kind === 'sos' ? <Text style={styles.sos}>SOS</Text> : null}
                </View>
                <Text style={styles.muted}>
                  {b.vehicle.make} {b.vehicle.model} · {b.reference}
                </Text>
                <Text style={styles.muted}>{formatDateTime(b.createdAt)}</Text>
                {b.mechanic ? <Text style={styles.muted}>Mechanic: {b.mechanic.name}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={styles.total}>{rupees(b.charges.total)}</Text>
                <StatusBadge status={b.status} />
                {b.status === 'completed' ? <StatusBadge status={b.paymentStatus} /> : null}
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: { fontSize: 26 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '800', color: colors.text },
  sos: {
    fontSize: 10,
    fontWeight: '800',
    color: '#991b1b',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  muted: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  total: { fontSize: 15, fontWeight: '800', color: colors.text },
});
