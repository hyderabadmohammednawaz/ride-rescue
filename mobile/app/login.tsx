import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { API_URL, api } from '../lib/api';
import { describeAuthError, isValidIndianMobile, sendOtp, toE164 } from '../lib/phoneAuth';
import { setPendingSignup } from '../lib/signupDraft';
import { Button, Card } from '../components/ui';
import { colors } from '../lib/theme';

// The seeded customer and mechanic accounts were deleted so this side of the
// app runs on real, phone-verified signups, so there are no demo shortcuts
// here any more: sign in with a mobile number, or create an account.

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'password' | 'phone'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phoneAuthAvailable, setPhoneAuthAvailable] = useState(false);

  // Phone sign-in only appears if the server has Firebase credentials, so the
  // app never offers a button that cannot work.
  useEffect(() => {
    api<{ phoneAuth: boolean }>('/auth/config', { auth: false })
      .then((c) => setPhoneAuthAvailable(!!c.phoneAuth))
      .catch(() => setPhoneAuthAvailable(false));
  }, []);

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

  const startPhoneLogin = async () => {
    setError(null);
    if (!isValidIndianMobile(phone)) return setError('Enter a valid 10-digit mobile number');

    setBusy(true);
    try {
      const confirmation = await sendOtp(phone);
      setPendingSignup({ confirmation, phone: toE164(phone), payload: {}, loginOnly: true });
      router.push('/verify-phone');
    } catch (err: any) {
      setError(describeAuthError(err));
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

            {phoneAuthAvailable && (
              <View style={styles.tabs}>
                <Pressable
                  onPress={() => { setMode('password'); setError(null); }}
                  style={[styles.tab, mode === 'password' && styles.tabActive]}
                >
                  <Text style={[styles.tabText, mode === 'password' && styles.tabTextActive]}>Email</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setMode('phone'); setError(null); }}
                  style={[styles.tab, mode === 'phone' && styles.tabActive]}
                >
                  <Text style={[styles.tabText, mode === 'phone' && styles.tabTextActive]}>Mobile OTP</Text>
                </Pressable>
              </View>
            )}

            {mode === 'password' ? (
              <>
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
              </>
            ) : (
              <>
                <Text style={styles.label}>Mobile number</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.prefix}>
                    <Text style={styles.prefixText}>+91</Text>
                  </View>
                  <TextInput
                    value={phone}
                    onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit number"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    maxLength={10}
                    style={[styles.input, { flex: 1 }]}
                  />
                </View>
                <Text style={styles.hint}>We will text you a 6-digit code. No password needed.</Text>
                <Button label="Send code" onPress={startPhoneLogin} loading={busy} style={{ marginTop: 16 }} />
              </>
            )}

          </Card>

          <Pressable onPress={() => router.push('/forgot-password')} style={{ marginTop: 14 }}>
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/register')} style={styles.signupRow}>
            <Text style={styles.signupText}>
              New here? <Text style={styles.signupLink}>Create an account</Text>
            </Text>
          </Pressable>

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
  forgot: { textAlign: 'center', color: colors.brand, fontWeight: '700', fontSize: 13.5 },
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
  tabs: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, marginTop: 6 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.text },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prefix: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#f1f5f9',
  },
  prefixText: { fontSize: 15, fontWeight: '700', color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  signupRow: { marginTop: 18, paddingVertical: 6 },
  signupText: { textAlign: 'center', fontSize: 14, color: colors.textMuted },
  signupLink: { color: colors.brand, fontWeight: '800' },
  error: { backgroundColor: colors.dangerLight, borderRadius: 12, padding: 12, marginBottom: 6 },
  errorText: { color: '#991b1b', fontSize: 13 },
  divider: { textAlign: 'center', color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 22, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  apiNote: { textAlign: 'center', color: colors.textMuted, fontSize: 11, marginTop: 20 },
  apiHint: { textAlign: 'center', color: colors.textMuted, fontSize: 11, marginTop: 4, paddingHorizontal: 20 },
});
