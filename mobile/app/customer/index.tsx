import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { api, rupees } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useSocketEvent } from '../../lib/socket';
import { Button, Card, Loading, StatusBadge, Stars } from '../../components/ui';
import TrackingMap, { type MapPin } from '../../components/TrackingMap';
import { colors } from '../../lib/theme';

const HOLD_MS = 2000;

interface Booking {
  _id: string;
  reference: string;
  status: string;
  kind: string;
  etaMinutes?: number;
  distanceKm?: number;
  serviceType?: { name: string; icon: string };
  mechanic?: { name: string } | null;
}

interface NearbyMechanic {
  _id: string;
  name: string;
  coordinates: [number, number];
  rating: number;
  distanceKm: number;
  etaMinutes: number;
  reasons: string[];
  matchScore: number;
}

interface ServiceType {
  _id: string;
  name: string;
  icon: string;
  basePrice: number;
  estimatedMinutes: number;
}

export default function CustomerHome() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();

  const [services, setServices] = useState<ServiceType[]>([]);
  const [nearby, setNearby] = useState<NearbyMechanic[]>([]);
  const [active, setActive] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);

  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = useRef(0);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      api<{ services: ServiceType[] }>('/services'),
      api<{ mechanics: NearbyMechanic[] }>('/services/mechanics/nearby?limit=5'),
      api<{ bookings: Booking[] }>('/bookings?status=pending,accepted,arrived,in_progress'),
    ]);
    if (results[0].status === 'fulfilled') setServices(results[0].value.services);
    if (results[1].status === 'fulfilled') setNearby(results[1].value.mechanics);
    if (results[2].status === 'fulfilled') setActive(results[2].value.bookings);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Push the phone's real GPS to the server so nearest-mechanic uses it.
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api('/profile/location', {
        method: 'PUT',
        body: { coordinates: [pos.coords.longitude, pos.coords.latitude] },
      }).catch(() => {});
      await refresh();
      load();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useSocketEvent<Booking>('booking:updated', () => load());
  useSocketEvent<Booking>('booking:assigned', () => load());

  const clearHold = () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = null;
    setHoldProgress(0);
  };

  const fireSos = async () => {
    clearHold();
    setSending(true);
    try {
      let coordinates: [number, number] | undefined;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        coordinates = [pos.coords.longitude, pos.coords.latitude];
      } catch {
        // Fall back to the last position stored on the account.
      }

      const { booking } = await api<{ booking: Booking }>('/bookings', {
        method: 'POST',
        body: { kind: 'sos', description: 'Emergency breakdown — SOS raised from the mobile app', coordinates },
      });

      Alert.alert(
        'Help is on the way',
        booking.mechanic
          ? `${booking.mechanic.name} has been assigned and will reach you in about ${booking.etaMinutes} minutes.`
          : 'Your SOS has been sent. We are finding a mechanic near you.'
      );
      router.push(`/customer/booking/${booking._id}`);
    } catch (err: any) {
      Alert.alert('Could not send SOS', err.message);
    } finally {
      setSending(false);
    }
  };

  const startHold = () => {
    if (sending) return;
    holdStart.current = Date.now();
    holdTimer.current = setInterval(() => {
      const pct = Math.min(1, (Date.now() - holdStart.current) / HOLD_MS);
      setHoldProgress(pct);
      if (pct >= 1) fireSos();
    }, 50);
  };

  const bookService = async (service: ServiceType) => {
    if (!user?.vehicles?.length) {
      Alert.alert('Add a vehicle first', 'Add your bike in the web app profile before booking a service.');
      return;
    }
    try {
      let coordinates: [number, number] | undefined;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coordinates = [pos.coords.longitude, pos.coords.latitude];
      } catch {
        /* use the saved account location */
      }
      const { booking } = await api<{ booking: Booking }>('/bookings', {
        method: 'POST',
        body: { serviceTypeId: service._id, kind: 'instant', coordinates },
      });
      router.push(`/customer/booking/${booking._id}`);
    } catch (err: any) {
      Alert.alert('Booking failed', err.message);
    }
  };

  if (loading) return <Loading />;

  const pins: MapPin[] = [
    ...(user?.location?.coordinates
      ? [{ id: 'me', lat: user.location.coordinates[1], lng: user.location.coordinates[0], kind: 'customer' as const, label: 'You are here' }]
      : []),
    ...nearby.map((m) => ({
      id: m._id,
      lat: m.coordinates[1],
      lng: m.coordinates[0],
      kind: 'mechanic' as const,
      label: `${m.name} · ${m.distanceKm} km`,
    })),
  ];

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
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name.split(' ')[0]} 👋</Text>
          <Text style={styles.sub}>{user?.location?.address || 'Location shared'}</Text>
        </View>
        <Pressable onPress={logout}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      {active.length > 0 && (
        <Card style={{ marginBottom: 16, borderColor: colors.brand }}>
          <Text style={styles.sectionTitle}>Active request</Text>
          {active.map((b) => (
            <Pressable key={b._id} onPress={() => router.push(`/customer/booking/${b._id}`)} style={styles.activeRow}>
              <Text style={styles.activeIcon}>{b.serviceType?.icon || '🔧'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeName}>{b.serviceType?.name}</Text>
                <Text style={styles.sub}>
                  {b.mechanic ? `${b.mechanic.name}` : 'Finding a mechanic…'}
                  {b.status === 'accepted' && b.etaMinutes !== undefined ? ` · ETA ${b.etaMinutes} min` : ''}
                </Text>
              </View>
              <StatusBadge status={b.status} />
            </Pressable>
          ))}
        </Card>
      )}

      <Card style={styles.sosCard}>
        <Text style={styles.sosTitle}>Broken down?</Text>
        <Text style={styles.sub}>We will dispatch the nearest mechanic instantly</Text>

        <Pressable
          onPressIn={startHold}
          onPressOut={clearHold}
          disabled={sending}
          style={({ pressed }) => [styles.sosButton, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
        >
          <Text style={styles.sosIcon}>{sending ? '📡' : '🚨'}</Text>
          <Text style={styles.sosLabel}>{sending ? 'SENDING' : 'SOS'}</Text>
        </Pressable>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${holdProgress * 100}%` }]} />
        </View>

        <Text style={styles.sosHint}>
          {sending ? 'Sharing your location…' : holdProgress > 0 ? 'Keep holding…' : 'Press and hold for 2 seconds'}
        </Text>

        {user?.emergencyContact?.phone ? (
          <Text style={styles.emergencyNote}>
            🆘 {user.emergencyContact.name || 'Your emergency contact'} will also be alerted
          </Text>
        ) : null}
      </Card>

      <Text style={styles.sectionHeading}>{nearby.length} mechanics near you</Text>
      <TrackingMap pins={pins} height={240} />

      <Text style={styles.sectionHeading}>Book a service</Text>
      <View style={styles.grid}>
        {services.map((s) => (
          <Pressable key={s._id} onPress={() => bookService(s)} style={styles.serviceCard}>
            <Text style={styles.serviceIcon}>{s.icon}</Text>
            <Text style={styles.serviceName}>{s.name}</Text>
            <Text style={styles.servicePrice}>{rupees(s.basePrice)}</Text>
            <Text style={styles.sub}>~{s.estimatedMinutes} min</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionHeading}>Top matches for you</Text>
      {nearby.slice(0, 3).map((m, i) => (
        <Card key={m._id} style={{ marginBottom: 10 }}>
          <View style={styles.mechRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{m.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.mechNameRow}>
                <Text style={styles.mechName}>{m.name}</Text>
                {i === 0 ? <Text style={styles.bestMatch}>Best match</Text> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Stars value={m.rating} />
                <Text style={styles.sub}>{m.rating.toFixed(1)}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.mechDistance}>{m.distanceKm} km</Text>
              <Text style={styles.sub}>{m.etaMinutes} min</Text>
            </View>
          </View>
          <Text style={styles.reason}>✨ {m.reasons.slice(0, 2).join(' · ')}</Text>
          <Text style={styles.matchScore}>AI match score {(m.matchScore * 100).toFixed(0)}%</Text>
        </Card>
      ))}

      <Button
        label="View all my bookings"
        variant="secondary"
        onPress={() => router.push('/customer/bookings')}
        style={{ marginTop: 8 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  greeting: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted },
  logout: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 8 },
  sectionHeading: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 22, marginBottom: 10 },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  activeIcon: { fontSize: 24 },
  activeName: { fontSize: 14, fontWeight: '700', color: colors.text },
  sosCard: { alignItems: 'center', paddingVertical: 26, borderColor: '#fecaca', backgroundColor: colors.dangerLight },
  sosTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  sosButton: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  sosIcon: { fontSize: 30 },
  sosLabel: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1, marginTop: 2 },
  progressTrack: { width: 160, height: 5, borderRadius: 999, backgroundColor: '#fecaca', marginTop: 14, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.danger },
  sosHint: { fontSize: 12, color: colors.textMuted, marginTop: 10, textAlign: 'center' },
  emergencyNote: { fontSize: 11, color: colors.textMuted, marginTop: 8, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  serviceCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  serviceIcon: { fontSize: 26 },
  serviceName: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 6 },
  servicePrice: { fontSize: 15, fontWeight: '800', color: colors.brand, marginTop: 4 },
  mechRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  mechNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mechName: { fontSize: 15, fontWeight: '700', color: colors.text },
  bestMatch: { fontSize: 10, fontWeight: '700', color: colors.success, backgroundColor: colors.successLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  mechDistance: { fontSize: 14, fontWeight: '700', color: colors.text },
  reason: { fontSize: 12, color: colors.text, marginTop: 10, backgroundColor: colors.brandLight, padding: 8, borderRadius: 10 },
  matchScore: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
});
