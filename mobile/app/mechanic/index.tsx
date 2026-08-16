import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { api, rupees } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useSocket, useSocketEvent } from '../../lib/socket';
import { Button, Card, Loading, StatTile, StatusBadge } from '../../components/ui';
import { colors } from '../../lib/theme';

interface Job {
  _id: string;
  reference: string;
  status: string;
  kind: string;
  etaMinutes?: number;
  distanceKm?: number;
  distanceFromMeKm?: number;
  etaFromMeMinutes?: number;
  charges: { labour: number; visitFee: number };
  vehicle: { make: string; model: string; registrationNumber: string };
  pickupLocation: { address?: string };
  serviceType?: { name: string; icon: string };
  customer?: { name: string; phone: string };
}

interface Dashboard {
  isAvailable: boolean;
  activeJobs: Job[];
  stats: {
    todayJobs: number;
    openRequests: number;
    completedToday: number;
    todayEarnings: number;
    rating: number;
    ratingCount: number;
    totalCompleted: number;
  };
}

export default function MechanicHome() {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const router = useRouter();

  const [data, setData] = useState<Dashboard | null>(null);
  const [openJobs, setOpenJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const watcher = useRef<Location.LocationSubscription | null>(null);

  const load = useCallback(async () => {
    const [dash, open] = await Promise.all([
      api<Dashboard>('/mechanic/dashboard'),
      api<{ bookings: Job[] }>('/bookings/available').catch(() => ({ bookings: [] as Job[] })),
    ]);
    setData(dash);
    setOpenJobs(open.bookings);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent<Job>('booking:assigned', (job) => {
    Alert.alert('New job assigned', `${job.serviceType?.name} — ${job.distanceKm} km away`);
    load();
  });
  useSocketEvent('booking:new', () => load());
  useSocketEvent('booking:updated', () => load());
  useSocketEvent('booking:taken', () => load());

  /**
   * Streams the phone's GPS to the server while the mechanic is riding, which is
   * what drives the customer's live tracking map.
   */
  const toggleSharing = async (next: boolean) => {
    if (!next) {
      watcher.current?.remove();
      watcher.current = null;
      setSharing(false);
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location permission needed', 'RideRescue needs your location to guide customers to you.');
      return;
    }

    const activeBookingId = data?.activeJobs.find((j) => j.status === 'accepted')?._id;
    watcher.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 20 },
      (pos) => {
        socket?.emit('location:update', {
          bookingId: activeBookingId,
          coordinates: [pos.coords.longitude, pos.coords.latitude],
        });
      }
    );
    setSharing(true);
  };

  useEffect(() => () => watcher.current?.remove(), []);

  const toggleAvailability = async (next: boolean) => {
    const res = await api<{ isAvailable: boolean }>('/mechanic/availability', {
      method: 'PATCH',
      body: { isAvailable: next },
    });
    setData((d) => (d ? { ...d, isAvailable: res.isAvailable } : d));
  };

  const accept = async (job: Job) => {
    try {
      await api(`/bookings/${job._id}/accept`, { method: 'POST', body: {} });
      Alert.alert('Job accepted', 'The customer can now track you live.');
      load();
      router.push(`/mechanic/job/${job._id}`);
    } catch (err: any) {
      Alert.alert('Could not accept', err.message);
    }
  };

  if (!data) return <Loading />;

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
          <Text style={styles.muted}>{data.isAvailable ? 'Online — visible to customers' : 'Offline'}</Text>
        </View>
        <Pressable onPress={logout}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      <Card style={{ marginBottom: 14 }}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Available for jobs</Text>
            <Text style={styles.muted}>Turn off to stop receiving new requests</Text>
          </View>
          <Switch value={data.isAvailable} onValueChange={toggleAvailability} trackColor={{ true: colors.brand }} />
        </View>
        <View style={[styles.toggleRow, { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Share live location</Text>
            <Text style={styles.muted}>Streams your GPS to the customer's tracking map</Text>
          </View>
          <Switch value={sharing} onValueChange={toggleSharing} trackColor={{ true: colors.brand }} />
        </View>
      </Card>

      <View style={styles.tiles}>
        <StatTile label="Today's earnings" value={rupees(data.stats.todayEarnings)} hint={`${data.stats.completedToday} completed`} tone="success" />
        <StatTile label="Jobs today" value={data.stats.todayJobs} />
      </View>
      <View style={[styles.tiles, { marginTop: 10 }]}>
        <StatTile label="Rating" value={`${data.stats.rating.toFixed(1)} ★`} hint={`${data.stats.ratingCount} ratings`} />
        <StatTile label="Open nearby" value={data.stats.openRequests} />
      </View>

      <Text style={styles.sectionHeading}>Active jobs</Text>
      {data.activeJobs.length === 0 ? (
        <Card>
          <Text style={styles.muted}>No active jobs. New requests appear here instantly.</Text>
        </Card>
      ) : (
        data.activeJobs.map((job) => (
          <Pressable key={job._id} onPress={() => router.push(`/mechanic/job/${job._id}`)}>
            <Card style={{ marginBottom: 10 }}>
              <View style={styles.jobHeader}>
                <Text style={styles.jobTitle}>
                  {job.serviceType?.icon} {job.serviceType?.name}
                </Text>
                <StatusBadge status={job.status} />
              </View>
              <Text style={styles.jobCustomer}>
                {job.customer?.name} · {job.customer?.phone}
              </Text>
              <Text style={styles.muted}>
                {job.vehicle.make} {job.vehicle.model} ({job.vehicle.registrationNumber})
              </Text>
              <Text style={styles.muted}>📍 {job.pickupLocation.address || 'Location shared'}</Text>
              <View style={styles.jobFooter}>
                <Text style={styles.muted}>You earn</Text>
                <Text style={styles.jobEarn}>{rupees(job.charges.labour + job.charges.visitFee)}</Text>
              </View>
            </Card>
          </Pressable>
        ))
      )}

      <Text style={styles.sectionHeading}>Open requests near you</Text>
      {openJobs.length === 0 ? (
        <Card>
          <Text style={styles.muted}>Nothing open right now within your service radius.</Text>
        </Card>
      ) : (
        openJobs.map((job) => (
          <Card key={job._id} style={{ marginBottom: 10 }}>
            <View style={styles.jobHeader}>
              <Text style={styles.jobTitle}>
                {job.serviceType?.icon} {job.serviceType?.name}
              </Text>
              {job.kind === 'sos' ? <Text style={styles.sosTag}>🚨 SOS</Text> : null}
            </View>
            <Text style={styles.jobCustomer}>{job.customer?.name}</Text>
            <Text style={styles.muted}>
              {job.vehicle.make} {job.vehicle.model}
            </Text>
            <Text style={styles.distance}>
              {job.distanceFromMeKm} km away · {job.etaFromMeMinutes} min ride
            </Text>
            <View style={styles.jobFooter}>
              <Text style={styles.jobEarn}>{rupees(job.charges.labour + job.charges.visitFee)}</Text>
              <Button label="Accept job" onPress={() => accept(job)} />
            </View>
          </Card>
        ))
      )}

      <Button
        label="View earnings"
        variant="secondary"
        onPress={() => router.push('/mechanic/earnings')}
        style={{ marginTop: 14 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  greeting: { fontSize: 20, fontWeight: '800', color: colors.text },
  muted: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  logout: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  tiles: { flexDirection: 'row', gap: 10 },
  sectionHeading: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 22, marginBottom: 10 },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  jobTitle: { fontSize: 15, fontWeight: '800', color: colors.text, flexShrink: 1 },
  jobCustomer: { fontSize: 13, fontWeight: '600', color: colors.text },
  distance: { fontSize: 13, fontWeight: '700', color: colors.brand, marginTop: 4 },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  jobEarn: { fontSize: 16, fontWeight: '800', color: colors.text },
  sosTag: {
    fontSize: 11,
    fontWeight: '800',
    color: '#991b1b',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
});
