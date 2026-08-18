import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, rupees } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, Card, Loading, Row, Stars } from '../../components/ui';
import { colors } from '../../lib/theme';

/**
 * Mechanic profile: the settings that decide which jobs reach this account.
 *
 * Availability is not cosmetic — the dispatch query filters on it, so a mechanic
 * who is offline is invisible to the AI matcher no matter how well they would
 * have scored. Service radius and hourly rate feed the same ranking.
 */
export default function MechanicProfileScreen() {
  const { user, refresh, logout } = useAuth();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [experience, setExperience] = useState(String(user?.mechanicProfile?.experienceYears ?? ''));
  const [radius, setRadius] = useState(String(user?.mechanicProfile?.serviceRadiusKm ?? ''));
  const [rate, setRate] = useState(String((user?.mechanicProfile as any)?.hourlyRate ?? ''));

  if (!user) return <Loading />;
  const profile = user.mechanicProfile;

  const setAvailability = async (next: boolean) => {
    try {
      await api('/mechanic/availability', { method: 'PATCH', body: { isAvailable: next } });
      await refresh();
    } catch (err: any) {
      Alert.alert('Could not update', err.message);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api('/profile', {
        method: 'PATCH',
        body: {
          mechanicProfile: {
            experienceYears: experience ? Number(experience) : 0,
            serviceRadiusKm: radius ? Number(radius) : 15,
            hourlyRate: rate ? Number(rate) : 250,
          },
        },
      });
      await refresh();
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (err: any) {
      Alert.alert('Could not save', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        />
      }
    >
      <Card>
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: user.avatarColor || colors.brand }]}>
            <Text style={styles.avatarText}>{(user.name || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.sub}>{user.phone}</Text>
            {profile ? (
              <View style={styles.ratingRow}>
                <Stars value={profile.ratingAverage || 0} />
                <Text style={styles.ratingText}>
                  {profile.ratingCount ? `${profile.ratingAverage.toFixed(1)} · ${profile.ratingCount} ratings` : 'No ratings yet'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <View style={styles.availRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.availTitle}>{profile?.isAvailable ? 'Online' : 'Offline'}</Text>
            <Text style={styles.availHint}>
              {profile?.isAvailable
                ? 'You appear in nearest-mechanic searches and can be auto-assigned.'
                : 'You are hidden from dispatch — no new jobs will reach you.'}
            </Text>
          </View>
          <Switch
            value={!!profile?.isAvailable}
            onValueChange={setAvailability}
            trackColor={{ true: colors.success, false: colors.border }}
          />
        </View>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Performance</Text>
        <Row label="Completed jobs" value={String(profile?.completedJobs ?? 0)} />
        <Row label="Rating" value={profile?.ratingCount ? `${profile.ratingAverage.toFixed(1)} / 5` : '—'} />
        <Row label="Documents" value={(profile as any)?.documentsVerified ? 'Verified' : 'Pending admin review'} />
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Job settings</Text>
        <Text style={styles.cardHint}>
          Experience and distance both feed the AI match score, so these change which jobs you win.
        </Text>

        <Text style={styles.label}>Years of experience</Text>
        <TextInput
          value={experience}
          onChangeText={setExperience}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="5"
          placeholderTextColor="#94a3b8"
          style={styles.input}
        />

        <Text style={styles.label}>Service radius (km)</Text>
        <TextInput
          value={radius}
          onChangeText={setRadius}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="15"
          placeholderTextColor="#94a3b8"
          style={styles.input}
        />

        <Text style={styles.label}>Hourly rate (₹)</Text>
        <TextInput
          value={rate}
          onChangeText={setRate}
          keyboardType="number-pad"
          maxLength={5}
          placeholder="250"
          placeholderTextColor="#94a3b8"
          style={styles.input}
        />

        <Button label="Save settings" onPress={save} loading={busy} style={{ marginTop: 16 }} />
      </Card>

      <Button
        label="📜  Job history"
        variant="secondary"
        onPress={() => router.push('/mechanic/history')}
        style={{ marginTop: 16 }}
      />
      <Button
        label="Log out"
        variant="secondary"
        onPress={() =>
          Alert.alert('Log out?', 'You will need your mobile number to sign back in.', [
            { text: 'Stay', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: () => logout() },
          ])
        }
        style={{ marginTop: 8 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  identity: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ratingText: { fontSize: 12.5, color: colors.textMuted },

  availRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  availTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  availHint: { fontSize: 12.5, color: colors.textMuted, marginTop: 3 },

  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 8 },
  cardHint: { fontSize: 12.5, color: colors.textMuted, marginBottom: 6 },
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
});
