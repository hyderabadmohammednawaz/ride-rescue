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
import { useLocalSearchParams } from 'expo-router';
import { api, formatDateTime, rupees } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useSocket, useSocketEvent } from '../../../lib/socket';
import { Button, Card, Loading, Row, StatusBadge, Stars } from '../../../components/ui';
import TrackingMap, { type MapPin } from '../../../components/TrackingMap';
import { colors } from '../../../lib/theme';

const STEPS = [
  { key: 'pending', label: 'Requested', icon: '📨' },
  { key: 'accepted', label: 'On the way', icon: '🏍️' },
  { key: 'arrived', label: 'Arrived', icon: '📍' },
  { key: 'in_progress', label: 'Working', icon: '🔧' },
  { key: 'completed', label: 'Done', icon: '✅' },
];

interface Booking {
  _id: string;
  reference: string;
  status: string;
  kind: string;
  otpCode?: string;
  etaMinutes?: number;
  distanceKm?: number;
  rated?: boolean;
  paymentStatus: string;
  charges: { labour: number; parts: number; visitFee: number; discount: number; total: number };
  partsUsed: { name: string; quantity: number; price: number }[];
  vehicle: { make: string; model: string; registrationNumber: string };
  pickupLocation: { coordinates: [number, number]; address?: string };
  mechanicLocation?: { coordinates: [number, number] };
  serviceType?: { name: string; icon: string };
  recommendation?: { score: number; reasons: string[]; consideredCount: number };
  mechanic?: {
    _id: string;
    name: string;
    phone: string;
    mechanicProfile?: { ratingAverage: number; ratingCount: number; experienceYears: number };
  } | null;
  createdAt: string;
}

interface ChatMessage {
  _id: string;
  booking: string;
  sender: any;
  senderRole: string;
  text: string;
  createdAt: string;
}

export default function TrackBookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [live, setLive] = useState<{ coordinates: [number, number]; etaMinutes: number; distanceKm: number } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const chatRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    const { booking } = await api<{ booking: Booking }>(`/bookings/${id}`);
    setBooking(booking);
  }, [id]);

  useEffect(() => {
    load().catch((err) => Alert.alert('Could not load booking', err.message));
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

  useSocketEvent<{ bookingId: string; coordinates: [number, number]; etaMinutes: number; distanceKm: number }>(
    'booking:location',
    (payload) => {
      if (payload.bookingId === id) setLive(payload);
    }
  );

  useSocketEvent<ChatMessage>('chat:message', (msg) => {
    if (msg.booking !== id) return;
    setMessages((current) => (current.some((m) => m._id === msg._id) ? current : [...current, msg]));
  });

  const send = () => {
    const text = draft.trim();
    if (!text || !socket) return;
    socket.emit('chat:send', { bookingId: id, text }, () => {});
    setDraft('');
  };

  const pay = async (method: string) => {
    setBusy(true);
    try {
      const created = await api<{ payment: { _id: string } }>('/payments/create', {
        method: 'POST',
        body: { purpose: 'booking', bookingId: id, method },
      });
      await api(`/payments/${created.payment._id}/confirm`, { method: 'POST', body: {} });
      Alert.alert('Payment successful', 'Your invoice is ready in the web app.');
      await load();
    } catch (err: any) {
      Alert.alert('Payment failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitRating = async () => {
    if (!rating) return;
    setBusy(true);
    try {
      await api(`/bookings/${id}/review`, { method: 'POST', body: { rating } });
      Alert.alert('Thank you', 'Your rating helps other riders find good mechanics.');
      await load();
    } catch (err: any) {
      Alert.alert('Could not submit rating', err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!booking) return <Loading label="Loading your booking…" />;

  const mechanicCoords = live?.coordinates || booking.mechanicLocation?.coordinates;
  const pickup = booking.pickupLocation.coordinates;
  const eta = live?.etaMinutes ?? booking.etaMinutes;
  const distance = live?.distanceKm ?? booking.distanceKm;
  const stepIndex = STEPS.findIndex((s) => s.key === booking.status);

  const pins: MapPin[] = [
    { id: 'pickup', lat: pickup[1], lng: pickup[0], kind: 'customer', label: 'You' },
    ...(mechanicCoords && booking.mechanic
      ? [{ id: 'mechanic', lat: mechanicCoords[1], lng: mechanicCoords[0], kind: 'mechanic' as const, label: booking.mechanic.name }]
      : []),
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {booking.serviceType?.icon} {booking.serviceType?.name}
            </Text>
            <Text style={styles.reference}>{booking.reference}</Text>
          </View>
          <StatusBadge status={booking.status} />
        </View>

        {booking.status !== 'cancelled' && (
          <Card style={{ marginBottom: 14 }}>
            <View style={styles.stepper}>
              {STEPS.map((step, i) => (
                <View key={step.key} style={styles.step}>
                  <View style={[styles.stepDot, i <= stepIndex && { backgroundColor: colors.brand }]}>
                    <Text style={styles.stepIcon}>{step.icon}</Text>
                  </View>
                  <Text style={[styles.stepLabel, i <= stepIndex && { fontWeight: '700', color: colors.text }]}>
                    {step.label}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {booking.status === 'accepted' && eta !== undefined && (
          <View style={styles.etaBanner}>
            <View>
              <Text style={styles.etaLabel}>Arriving in</Text>
              <Text style={styles.etaValue}>{eta} min</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.etaLabel}>Distance</Text>
              <Text style={styles.etaDistance}>{distance} km</Text>
            </View>
          </View>
        )}

        {['accepted', 'arrived', 'in_progress'].includes(booking.status) && (
          <>
            <TrackingMap pins={pins} drawRoute={booking.status === 'accepted'} height={260} />
            <Text style={styles.mapNote}>The mechanic's position updates live as they ride toward you.</Text>
          </>
        )}

        {booking.mechanic && (
          <Card style={{ marginTop: 14 }}>
            <Text style={styles.cardTitle}>Your mechanic</Text>
            <View style={styles.mechRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{booking.mechanic.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mechName}>{booking.mechanic.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Stars value={booking.mechanic.mechanicProfile?.ratingAverage || 0} />
                  <Text style={styles.muted}>
                    {(booking.mechanic.mechanicProfile?.ratingAverage || 0).toFixed(1)} ·{' '}
                    {booking.mechanic.mechanicProfile?.experienceYears || 0} yrs
                  </Text>
                </View>
              </View>
              <Button label="📞 Call" variant="secondary" onPress={() => Linking.openURL(`tel:${booking.mechanic!.phone}`)} />
            </View>

            {booking.recommendation?.reasons?.length ? (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonTitle}>WHY WE PICKED THEM</Text>
                {booking.recommendation.reasons.map((r) => (
                  <Text key={r} style={styles.reasonItem}>
                    ✓ {r}
                  </Text>
                ))}
                <Text style={styles.muted}>
                  Chosen from {booking.recommendation.consideredCount} mechanics · match{' '}
                  {(booking.recommendation.score * 100).toFixed(0)}%
                </Text>
              </View>
            ) : null}
          </Card>
        )}

        {['accepted', 'arrived'].includes(booking.status) && booking.otpCode ? (
          <Card style={styles.otpCard}>
            <Text style={styles.otpTitle}>Start OTP</Text>
            <Text style={styles.otpHint}>Read this out only after the mechanic reaches you.</Text>
            <Text style={styles.otpCode}>{booking.otpCode}</Text>
          </Card>
        ) : null}

        {booking.mechanic && !['completed', 'cancelled'].includes(booking.status) && (
          <Card style={{ marginTop: 14 }}>
            <Text style={styles.cardTitle}>💬 Chat with {booking.mechanic.name}</Text>
            <ScrollView
              ref={chatRef}
              style={styles.chatBox}
              onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}
              nestedScrollEnabled
            >
              {messages.length === 0 ? (
                <Text style={styles.chatEmpty}>No messages yet. Share a landmark to help them find you.</Text>
              ) : (
                messages.map((m) => {
                  const mine = String(m.sender?._id || m.sender) === String(user?._id);
                  return (
                    <View key={m._id} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      <Text style={[styles.bubbleText, mine && { color: '#fff' }]}>{m.text}</Text>
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

        <Card style={{ marginTop: 14 }}>
          <Text style={styles.cardTitle}>Charges</Text>
          <Row label="Labour" value={rupees(booking.charges.labour)} />
          {booking.charges.visitFee > 0 ? <Row label="Emergency visit fee" value={rupees(booking.charges.visitFee)} /> : null}
          {booking.partsUsed.map((p, i) => (
            <Row key={i} label={`${p.name} × ${p.quantity}`} value={rupees(p.price * p.quantity)} />
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{rupees(booking.charges.total)}</Text>
          </View>
          <View style={{ marginTop: 8 }}>
            <StatusBadge status={booking.paymentStatus} />
          </View>

          {booking.status === 'completed' && booking.paymentStatus === 'unpaid' ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={styles.muted}>Pay with</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="📲 UPI" onPress={() => pay('upi')} disabled={busy} style={{ flex: 1 }} />
                <Button label="💳 Card" variant="secondary" onPress={() => pay('card')} disabled={busy} style={{ flex: 1 }} />
                <Button label="💵 Cash" variant="secondary" onPress={() => pay('cash')} disabled={busy} style={{ flex: 1 }} />
              </View>
            </View>
          ) : null}
        </Card>

        {booking.status === 'completed' && !booking.rated ? (
          <Card style={{ marginTop: 14 }}>
            <Text style={styles.cardTitle}>Rate {booking.mechanic?.name}</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setRating(n)}>
                  <Text style={[styles.ratingStar, n <= rating && { color: '#f59e0b' }]}>★</Text>
                </Pressable>
              ))}
            </View>
            <Button label="Submit rating" onPress={submitRating} disabled={!rating || busy} style={{ marginTop: 12 }} />
          </Card>
        ) : null}

        <Card style={{ marginTop: 14 }}>
          <Text style={styles.cardTitle}>Details</Text>
          <Row label="Vehicle" value={`${booking.vehicle.make} ${booking.vehicle.model}`} />
          <Row label="Registration" value={booking.vehicle.registrationNumber} />
          <Row label="Booked" value={formatDateTime(booking.createdAt)} />
          <Row label="Location" value={booking.pickupLocation.address || '—'} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  reference: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  muted: { fontSize: 12, color: colors.textMuted },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 10 },
  stepper: { flexDirection: 'row', justifyContent: 'space-between' },
  step: { alignItems: 'center', flex: 1, gap: 4 },
  stepDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  stepIcon: { fontSize: 15 },
  stepLabel: { fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  etaBanner: {
    backgroundColor: colors.brand,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  etaLabel: { color: '#bfdbfe', fontSize: 12 },
  etaValue: { color: '#fff', fontSize: 28, fontWeight: '900' },
  etaDistance: { color: '#fff', fontSize: 18, fontWeight: '800' },
  mapNote: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  mechRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  mechName: { fontSize: 16, fontWeight: '800', color: colors.text },
  reasonBox: { backgroundColor: colors.background, borderRadius: 12, padding: 12, marginTop: 12, gap: 3 },
  reasonTitle: { fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.6, marginBottom: 4 },
  reasonItem: { fontSize: 13, color: colors.text },
  otpCard: { marginTop: 14, backgroundColor: colors.warnLight, borderColor: '#fcd34d', alignItems: 'center' },
  otpTitle: { fontSize: 14, fontWeight: '800', color: '#92400e' },
  otpHint: { fontSize: 12, color: '#92400e', marginTop: 4, textAlign: 'center' },
  otpCode: { fontSize: 38, fontWeight: '900', letterSpacing: 12, color: '#92400e', marginTop: 10 },
  chatBox: { maxHeight: 220, backgroundColor: colors.background, borderRadius: 12, padding: 10 },
  chatEmpty: { fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },
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
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    paddingTop: 8,
  },
  totalLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  totalValue: { fontSize: 15, fontWeight: '800', color: colors.text },
  ratingRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  ratingStar: { fontSize: 38, color: '#cbd5e1' },
});
