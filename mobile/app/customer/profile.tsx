import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api, rupees } from '../../lib/api';
import { useAuth, type User, type Vehicle } from '../../lib/auth';
import { Button, Card, Empty, Loading, Row } from '../../components/ui';
import { colors } from '../../lib/theme';

/**
 * Customer profile: personal details and the garage.
 *
 * Vehicles matter more than they look. A booking records which bike it was for,
 * the parts store filters to the customer's make and model, and predictive
 * maintenance has nothing to predict without one — so a customer with no vehicle
 * silently loses three features. This screen is where they add one.
 */

/** Shape returned by GET /profile/vehicles/:id/maintenance — verified against the API. */
interface Prediction {
  key: string;
  label: string;
  icon?: string;
  urgency: 'overdue' | 'soon' | 'upcoming' | string;
  kmRemaining: number;
  daysRemaining: number;
  reason: string;
  estimatedCost?: number;
}

const URGENCY_TONE: Record<string, { bg: string; fg: string }> = {
  overdue: { bg: colors.dangerLight, fg: '#991b1b' },
  soon: { bg: colors.warnLight, fg: '#92400e' },
};

const BLANK = {
  make: '',
  model: '',
  year: '',
  registrationNumber: '',
  fuelType: 'Petrol' as 'Petrol' | 'Electric',
  odometerKm: '',
};

export default function CustomerProfileScreen() {
  const { user, refresh, logout } = useAuth();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);

  const [health, setHealth] = useState<Record<string, { score: number; predictions: Prediction[] }>>({});

  const set = (key: keyof typeof BLANK) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const openAdd = () => {
    setForm(BLANK);
    setEditing(null);
    setAdding(true);
  };

  const openEdit = (v: Vehicle) => {
    setForm({
      make: v.make || '',
      model: v.model || '',
      year: v.year ? String(v.year) : '',
      registrationNumber: v.registrationNumber || '',
      fuelType: (v.fuelType as 'Petrol' | 'Electric') || 'Petrol',
      odometerKm: v.odometerKm ? String(v.odometerKm) : '',
    });
    setEditing(v);
    setAdding(true);
  };

  const save = async () => {
    if (!form.make.trim() || !form.model.trim() || !form.registrationNumber.trim()) {
      Alert.alert('Missing details', 'Make, model and registration number are required.');
      return;
    }
    setBusy(true);
    try {
      const body = {
        make: form.make.trim(),
        model: form.model.trim(),
        registrationNumber: form.registrationNumber.trim().toUpperCase(),
        fuelType: form.fuelType,
        year: form.year ? Number(form.year) : undefined,
        odometerKm: form.odometerKm ? Number(form.odometerKm) : 0,
      };
      if (editing?._id) {
        await api(`/profile/vehicles/${editing._id}`, { method: 'PATCH', body });
      } else {
        await api('/profile/vehicles', { method: 'POST', body });
      }
      setAdding(false);
      setEditing(null);
      await refresh();
    } catch (err: any) {
      Alert.alert('Could not save', err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (v: Vehicle) => {
    Alert.alert('Remove this bike?', `${v.make} ${v.model} · ${v.registrationNumber}`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/profile/vehicles/${v._id}`, { method: 'DELETE' });
            await refresh();
          } catch (err: any) {
            Alert.alert('Could not remove', err.message);
          }
        },
      },
    ]);
  };

  const makePrimary = async (v: Vehicle) => {
    try {
      await api(`/profile/vehicles/${v._id}`, { method: 'PATCH', body: { isPrimary: true } });
      await refresh();
    } catch (err: any) {
      Alert.alert('Could not update', err.message);
    }
  };

  /** Pulls the AI maintenance forecast for one bike, on demand. */
  const checkHealth = async (v: Vehicle) => {
    if (!v._id) return;
    try {
      const res = await api<{ healthScore: number; predictions: Prediction[] }>(
        `/profile/vehicles/${v._id}/maintenance`
      );
      setHealth((h) => ({ ...h, [v._id!]: { score: res.healthScore, predictions: res.predictions || [] } }));
    } catch (err: any) {
      Alert.alert('Could not load forecast', err.message);
    }
  };

  useEffect(() => {
    if (!user) router.replace('/login');
  }, [user, router]);

  if (!user) return <Loading />;

  const vehicles = user.vehicles || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
      >
        <Text style={styles.title}>Profile</Text>

        <Card style={{ marginTop: 14 }}>
          <View style={styles.identity}>
            <View style={[styles.avatar, { backgroundColor: user.avatarColor || colors.brand }]}>
              <Text style={styles.avatarText}>{(user.name || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.sub}>{user.phone}</Text>
              <Text style={styles.sub}>{user.email}</Text>
            </View>
          </View>

          <View style={styles.divider} />
          <Row label="Wallet balance" value={rupees(user.walletBalance || 0)} />
          {user.referralCode ? <Row label="Referral code" value={user.referralCode} /> : null}
          <Row label="Account" value={user.phoneVerified ? 'Phone verified' : 'Unverified'} />
        </Card>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>My bikes</Text>
          <Pressable onPress={openAdd} hitSlop={10}>
            <Text style={styles.addLink}>+ Add bike</Text>
          </Pressable>
        </View>

        {vehicles.length === 0 ? (
          <Card>
            <Empty
              icon="🏍️"
              title="No bikes yet"
              hint="Add your bike so bookings record it, the store filters to your model, and maintenance can be forecast."
            />
            <Button label="Add your first bike" onPress={openAdd} style={{ marginTop: 12 }} />
          </Card>
        ) : (
          vehicles.map((v) => {
            const h = v._id ? health[v._id] : undefined;
            return (
              <Card key={v._id} style={{ marginBottom: 12 }}>
                <View style={styles.bikeHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bikeName}>
                      {v.make} {v.model}
                      {v.year ? ` · ${v.year}` : ''}
                    </Text>
                    <Text style={styles.reg}>{v.registrationNumber}</Text>
                  </View>
                  {v.isPrimary ? (
                    <View style={styles.primaryTag}>
                      <Text style={styles.primaryTagText}>PRIMARY</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.divider} />
                <Row label="Fuel" value={v.fuelType || 'Petrol'} />
                <Row label="Odometer" value={`${(v.odometerKm || 0).toLocaleString('en-IN')} km`} />

                {h ? (
                  <View style={styles.health}>
                    <Text style={styles.healthScore}>
                      Health {h.score}
                      <Text style={styles.healthOutOf}>/100</Text>
                    </Text>
                    <Text style={styles.healthHint}>
                      Predicted from distance ridden and time since the last service — whichever falls due
                      first.
                    </Text>
                    {h.predictions.slice(0, 4).map((p) => {
                      const tone = URGENCY_TONE[p.urgency];
                      return (
                        <View key={p.key} style={styles.predictionRow}>
                          <Text style={styles.predictionLabel}>
                            {p.icon ? `${p.icon} ` : ''}
                            {p.label}
                          </Text>
                          {tone ? (
                            <View style={[styles.urgencyTag, { backgroundColor: tone.bg }]}>
                              <Text style={[styles.urgencyText, { color: tone.fg }]}>
                                {p.urgency.toUpperCase()}
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.predictionMeta}>
                              {Math.max(0, Math.round(p.kmRemaining))} km
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                <View style={styles.bikeActions}>
                  <Button
                    label={h ? 'Refresh forecast' : '🔮 Maintenance'}
                    variant="secondary"
                    onPress={() => checkHealth(v)}
                    style={{ flex: 1 }}
                  />
                  <Button label="Edit" variant="secondary" onPress={() => openEdit(v)} style={{ flex: 1 }} />
                </View>
                <View style={styles.bikeActions}>
                  {!v.isPrimary ? (
                    <Button
                      label="Make primary"
                      variant="secondary"
                      onPress={() => makePrimary(v)}
                      style={{ flex: 1 }}
                    />
                  ) : null}
                  <Button label="Remove" variant="danger" onPress={() => remove(v)} style={{ flex: 1 }} />
                </View>
              </Card>
            );
          })
        )}

        <Button
          label="Log out"
          variant="secondary"
          onPress={() =>
            Alert.alert('Log out?', 'You will need your mobile number to sign back in.', [
              { text: 'Stay', style: 'cancel' },
              { text: 'Log out', style: 'destructive', onPress: () => logout() },
            ])
          }
          style={{ marginTop: 20 }}
        />
      </ScrollView>

      <Modal visible={adding} animationType="slide" transparent onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
          <View style={styles.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>{editing ? 'Edit bike' : 'Add a bike'}</Text>

              <Text style={styles.label}>Make</Text>
              <TextInput
                value={form.make}
                onChangeText={set('make')}
                placeholder="Honda"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />

              <Text style={styles.label}>Model</Text>
              <TextInput
                value={form.model}
                onChangeText={set('model')}
                placeholder="Activa 6G"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />

              <Text style={styles.label}>Registration number</Text>
              <TextInput
                value={form.registrationNumber}
                onChangeText={set('registrationNumber')}
                placeholder="AP03AB1234"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                style={styles.input}
              />

              <View style={styles.split}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Year</Text>
                  <TextInput
                    value={form.year}
                    onChangeText={set('year')}
                    placeholder="2021"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    maxLength={4}
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Odometer (km)</Text>
                  <TextInput
                    value={form.odometerKm}
                    onChangeText={set('odometerKm')}
                    placeholder="18500"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.fuelRow}>
                <Text style={styles.label}>Electric</Text>
                <Switch
                  value={form.fuelType === 'Electric'}
                  onValueChange={(on) => setForm((f) => ({ ...f, fuelType: on ? 'Electric' : 'Petrol' }))}
                  trackColor={{ true: colors.brand, false: colors.border }}
                />
              </View>
              <Text style={styles.hint}>
                The odometer drives the maintenance forecast — an approximate figure is fine.
              </Text>

              <Button label={editing ? 'Save changes' : 'Add bike'} onPress={save} loading={busy} style={{ marginTop: 16 }} />
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setAdding(false);
                  setEditing(null);
                }}
                style={{ marginTop: 8 }}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: '900', color: colors.text },

  identity: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 1 },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },

  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 26,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  addLink: { fontSize: 14, fontWeight: '700', color: colors.brand },

  bikeHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bikeName: { fontSize: 16, fontWeight: '800', color: colors.text },
  reg: { fontSize: 13, color: colors.textMuted, marginTop: 2, letterSpacing: 0.5 },
  primaryTag: { backgroundColor: colors.brandLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  primaryTagText: { fontSize: 10, fontWeight: '800', color: colors.brandDark, letterSpacing: 0.6 },

  health: {
    marginTop: 12,
    backgroundColor: colors.successLight,
    borderRadius: 10,
    padding: 12,
  },
  healthScore: { fontSize: 17, fontWeight: '900', color: '#065f46' },
  healthOutOf: { fontSize: 13, fontWeight: '700', color: '#059669' },
  healthHint: { fontSize: 11.5, color: '#047857', marginTop: 3, marginBottom: 6 },
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 4,
  },
  predictionLabel: { fontSize: 13, color: '#065f46', flex: 1 },
  predictionMeta: { fontSize: 12, color: '#047857', fontWeight: '700' },
  urgencyTag: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  urgencyText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },

  bikeActions: { flexDirection: 'row', gap: 8, marginTop: 10 },

  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6, marginTop: 10 },
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
  split: { flexDirection: 'row', gap: 12 },
  fuelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
});
