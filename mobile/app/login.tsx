import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { API_URL } from '../lib/api';
import { Button, Card } from '../components/ui';
import { colors } from '../lib/theme';

const DEMO = [
  { label: '🧑  Customer', email: 'customer@riderescue.in' },
  { label: '🔧  Mechanic', email: 'mechanic@riderescue.in' },
];

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (presetEmail?: string) => {
    setError(null);
    setBusy(true);
    try {
      const user = await login(presetEmail || email, presetEmail ? 'password123' : password);
      if (user.role === 'mechanic') router.replace('/mechanic');
      else if (user.role === 'customer') router.replace('/customer');
      else setError('Vendor and admin accounts use the web dashboard, not the mobile app.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <Text style={styles.brandIcon}>🏍️</Text>
            <Text style={styles.brand}>
              Ride<Text style={{ color: colors.brand }}>Rescue</Text>
            </Text>
          </View>
          <Text style={styles.tagline}>Roadside help for your two-wheeler, in minutes.</Text>

          <Card style={{ marginTop: 24 }}>
            <Text style={styles.title}>Log in</Text>

            {error ? (
              <View style={styles.error}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              style={styles.input}
            />

            <Button label="Log in" onPress={() => submit()} loading={busy} style={{ marginTop: 16 }} />

            <Text style={styles.divider}>Demo accounts · password123</Text>
            {DEMO.map((d) => (
              <Button
                key={d.email}
                label={d.label}
                variant="secondary"
                onPress={() => submit(d.email)}
                disabled={busy}
                style={{ marginTop: 8 }}
              />
            ))}
          </Card>

          <Text style={styles.apiNote}>Backend: {API_URL}</Text>
          <Text style={styles.apiHint}>
            If login times out, set EXPO_PUBLIC_API_URL to your PC's LAN IP (see mobile/.env.example).
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, paddingTop: 48, paddingBottom: 40 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  brandIcon: { fontSize: 30 },
  brand: { fontSize: 27, fontWeight: '900', color: colors.text },
  tagline: { textAlign: 'center', color: colors.textMuted, marginTop: 8, fontSize: 14 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6, marginTop: 10 },
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
  error: { backgroundColor: colors.dangerLight, borderRadius: 12, padding: 12, marginBottom: 6 },
  errorText: { color: '#991b1b', fontSize: 13 },
  divider: { textAlign: 'center', color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 22, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  apiNote: { textAlign: 'center', color: colors.textMuted, fontSize: 11, marginTop: 20 },
  apiHint: { textAlign: 'center', color: colors.textMuted, fontSize: 11, marginTop: 4, paddingHorizontal: 20 },
});
