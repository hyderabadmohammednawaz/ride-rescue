import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { api, rupees } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useSocket, useSocketEvent } from '../../../lib/socket';
import { Button, Card, Loading, Row, StatusBadge } from '../../../components/ui';
import TrackingMap, { type MapPin } from '../../../components/TrackingMap';
import { colors } from '../../../lib/theme';

interface Booking {
  _id: string;
  reference: string;
  status: string;
  kind: string;
  distanceKm?: number;
  description?: string;
  charges: { labour: number; parts: number; visitFee: number; total: number };
  partsUsed: { part?: string; name: string; quantity: number; price: number }[];
  vehicle: { make: string; model: string; registrationNumber: string };
  pickupLocation: { coordinates: [number, number]; address?: string };
  mechanicLocation?: { coordinates: [number, number] };
  serviceType?: { name: string; icon: string; slug?: string };
  customer?: { _id: string; name: string; phone: string };
}

interface SparePart {
  _id: string;
  name: string;
  price: number;
  image?: string;
}

interface ChatMessage {
  _id: string;
  booking: string;
  sender: any;
  text: string;
}

export default function MechanicJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { socket } = useSocket();
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [suggested, setSuggested] = useState<SparePart[]>([]);
  const [used, setUsed] = useState<{ part: string; name: string; quantity: number; price: number }[]>([]);
  const [labour, setLabour] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const watcher = useRef<Location.LocationSubscription | null>(null);

  const load = useCallback(async () => {
    const { booking } = await api<{ booking: Booking }>(`/bookings/${id}`);
    setBooking(booking);
    setLabour(String(booking.charges.labour));
    setUsed(booking.partsUsed.map((p) => ({ part: String(p.part || ''), name: p.name, quantity: p.quantity, price: p.price })));
  }, [id]);

  useEffect(() => {
    load().catch((err) => Alert.alert('Could not load job', err.message));
    api<{ parts: SparePart[] }>(`/bookings/${id}/suggested-parts`)
      .then((d) => setSuggested(d.parts))
      .catch(() => {});
    api<{ messages: ChatMessage[] }>(`/bookings/${id}/messages`)
      .then((d) => setMessages(d.messages))
      .catch(() => {});
  }, [load, id]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('booking:join', id, () => {});
    return () => {
      socket.emit('booking:leave', id);
    };
  }, [socket, id]);

  useSocketEvent<Booking>('booking:updated', (updated) => {
    if (updated._id === id) setBooking(updated);
  });

  useSocketEvent<ChatMessage>('chat:message', (msg) => {
    if (msg.booking !== id) return;
    setMessages((c) => (c.some((m) => m._id === msg._id) ? c : [...c, msg]));
  });

  // While riding to the customer, push GPS so their map follows this device.
  useEffect(() => {
    if (booking?.status !== 'accepted' || !socket) return;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      watcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 20 },
        (pos) => socket.emit('location:update', { bookingId: id, coordinates: [pos.coords.longitude, pos.coords.latitude] })
      );
    })();

    return () => {
      cancelled = true;
      watcher.current?.remove();
      watcher.current = null;
    };
  }, [booking?.status, socket, id]);

  const changeStatus = async (status: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const { booking: updated } = await api<{ booking: Booking }>(`/bookings/${id}/status`, {
        method: 'PATCH',
        body: { status, ...extra },
      });
      setBooking(updated);
      if (status === 'completed') {
        Alert.alert('Job completed', `Total billed: ${rupees(updated.charges.total)}`);
        router.replace('/mechanic');
      }
    } catch (err: any) {
      Alert.alert('Could not update', err.message);
    } finally {
      setBusy(false);
    }
  };

  const addPart = (part: SparePart) =>
    setUsed((current) => {
      const existing = current.find((u) => u.part === part._id);
      if (existing) return current.map((u) => (u.part === part._id ? { ...u, quantity: u.quantity + 1 } : u));
      return [...current, { part: part._id, name: part.name, quantity: 1, price: part.price }];
    });

  const send = () => {
    const text = draft.trim();
    if (!text || !socket) return;
    socket.emit('chat:send', { bookingId: id, text }, () => {});
    setDraft('');
  };

  if (!booking) return <Loading />;

  const partsTotal = used.reduce((s, p) => s + p.price * p.quantity, 0);
  const grandTotal = Number(labour || 0) + partsTotal + booking.charges.visitFee;

  const pickup = booking.pickupLocation.coordinates;
  const mine = booking.mechanicLocation?.coordinates;
  const pins: MapPin[] = [
    { id: 'pickup', lat: pickup[1], lng: pickup[0], kind: 'customer', label: booking.customer?.name || 'Customer' },
    ...(mine ? [{ id: 'me', lat: mine[1], lng: mine[0], kind: 'mechanic' as const, label: 'You' }] : []),
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {booking.serviceType?.icon} {booking.serviceType?.name}
            </Text>
            <Text style={styles.muted}>{booking.reference}</Text>
          </View>
          <StatusBadge status={booking.status} />
        </View>

        <TrackingMap pins={pins} drawRoute={booking.status === 'accepted'} height={230} />

        <Button
          label="🧭 Open in Google Maps"
          variant="secondary"
          style={{ marginTop: 10 }}
          onPress={() =>
            Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${pickup[1]},${pickup[0]}`)
          }
        />

        <Card style={{ marginTop: 14 }}>
          <Text style={styles.cardTitle}>Customer</Text>
          <Row label="Name" value={booking.customer?.name || '—'} />
          <Row label="Vehicle" value={`${booking.vehicle.make} ${booking.vehicle.model}`} />
          <Row label="Registration" value={booking.vehicle.registrationNumber} />
          <Row label="Location" value={booking.pickupLocation.address || '—'} />
          {booking.description ? <Text style={styles.problem}>"{booking.description}"</Text> : null}
          <Button
            label={`📞 Call ${booking.customer?.phone || ''}`}
            variant="secondary"
            style={{ marginTop: 12 }}
            onPress={() => Linking.openURL(`tel:${booking.customer?.phone}`)}
          />
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={styles.cardTitle}>Update job status</Text>

          {booking.status === 'accepted' && (
            <Button label="📍 I have arrived" onPress={() => changeStatus('arrived')} loading={busy} />
          )}

          {booking.status === 'arrived' && (
            <View>
              <Text style={styles.label}>Start OTP from the customer</Text>
              <TextInput
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/\D/g, ''))}
                maxLength={4}
                keyboardType="number-pad"
                placeholder="····"
                placeholderTextColor="#94a3b8"
                style={styles.otpInput}
              />
              <Text style={styles.muted}>Ask the customer to read out the 4-digit code in their app.</Text>
              <Button
                label="🔧 Start work"
                onPress={() => changeStatus('in_progress', { otpCode: otp })}
                disabled={otp.length !== 4}
                loading={busy}
                style={{ marginTop: 12 }}
              />
            </View>
          )}

          {booking.status === 'in_progress' && (
            <View>
              <Text style={styles.label}>Suggested parts for this job</Text>
              <View style={styles.chipRow}>
                {suggested.map((p) => (
                  <Pressable key={p._id} onPress={() => addPart(p)} style={styles.chip}>
                    <Text style={styles.chipText}>
                      + {p.image} {p.name} ({rupees(p.price)})
                    </Text>
                  </Pressable>
                ))}
              </View>

              {used.map((u) => (
                <View key={u.part} style={styles.usedRow}>
                  <Text style={styles.usedName}>{u.name}</Text>
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() =>
                        setUsed((c) =>
                          c.map((x) => (x.part === u.part ? { ...x, quantity: x.quantity - 1 } : x)).filter((x) => x.quantity > 0)
                        )
                      }
                      style={styles.stepperBtn}
                    >
                      <Text style={styles.stepperText}>−</Text>
                    </Pressable>
                    <Text style={styles.qty}>{u.quantity}</Text>
                    <Pressable
                      onPress={() => setUsed((c) => c.map((x) => (x.part === u.part ? { ...x, quantity: x.quantity + 1 } : x)))}
                      style={styles.stepperBtn}
                    >
                      <Text style={styles.stepperText}>+</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.usedTotal}>{rupees(u.price * u.quantity)}</Text>
                </View>
              ))}

              <Text style={styles.label}>Labour charge (₹)</Text>
              <TextInput
                value={labour}
                onChangeText={setLabour}
                keyboardType="number-pad"
                style={styles.input}
                placeholderTextColor="#94a3b8"
              />

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total bill</Text>
                <Text style={styles.totalValue}>{rupees(grandTotal)}</Text>
              </View>

              <Button
                label="Mark job complete"
                onPress={() => changeStatus('completed', { labourCharge: Number(labour), partsUsed: used })}
                loading={busy}
                style={{ marginTop: 12 }}
              />
            </View>
          )}

          {booking.status === 'completed' && <Text style={styles.muted}>This job is complete.</Text>}
        </Card>

        {!['completed', 'cancelled'].includes(booking.status) && (
          <Card style={{ marginTop: 14 }}>
            <Text style={styles.cardTitle}>💬 Chat with {booking.customer?.name}</Text>
            <ScrollView style={styles.chatBox} nestedScrollEnabled>
              {messages.length === 0 ? (
                <Text style={styles.chatEmpty}>No messages yet.</Text>
              ) : (
                messages.map((m) => {
                  const isMine = String(m.sender?._id || m.sender) === String(user?._id);
                  return (
                    <View key={m._id} style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      <Text style={[styles.bubbleText, isMine && { color: '#fff' }]}>{m.text}</Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <View style={styles.chatInputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message…"
                placeholderTextColor="#94a3b8"
                style={styles.chatInput}
                onSubmitEditing={send}
              />
              <Button label="Send" onPress={send} disabled={!draft.trim()} />
            </View>
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  muted: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 12, marginBottom: 6 },
  problem: { fontSize: 13, color: colors.text, backgroundColor: colors.background, padding: 10, borderRadius: 10, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#fff',
  },
  otpInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 14,
    textAlign: 'center',
    color: colors.text,
    backgroundColor: '#fff',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipText: { fontSize: 12, color: colors.text },
  usedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  usedName: { flex: 1, fontSize: 13, color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  stepperBtn: { paddingHorizontal: 11, paddingVertical: 5 },
  stepperText: { fontSize: 17, color: colors.text },
  qty: { width: 26, textAlign: 'center', fontSize: 14, fontWeight: '700', color: colors.text },
  usedTotal: { width: 72, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.text },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 12,
    marginTop: 14,
  },
  totalLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  totalValue: { fontSize: 17, fontWeight: '900', color: colors.text },
  chatBox: { maxHeight: 200, backgroundColor: colors.background, borderRadius: 12, padding: 10 },
  chatEmpty: { fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingVertical: 20 },
  bubble: { maxWidth: '85%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.brand },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: '#e2e8f0' },
  bubbleText: { fontSize: 13, color: colors.text },
  chatInputRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: '#fff',
  },
});
