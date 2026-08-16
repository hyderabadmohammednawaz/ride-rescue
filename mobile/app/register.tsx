import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { describeAuthError, isValidIndianMobile, sendOtp, toE164 } from '../lib/phoneAuth';
import { Button, Card } from '../components/ui';
import { colors } from '../lib/theme';
import { setPendingSignup } from '../lib/signupDraft';

const ROLES = [
  { value: 'customer', label: 'Customer', icon: '🧑', hint: 'Book services and buy parts' },
  { value: 'mechanic', label: 'Mechanic', icon: '🔧', hint: 'Accept jobs and earn' },
];

export default function RegisterScreen() {
  const router = useRouter();
  const [role, setRole] = useState('customer');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    experienceYears: '',
    drivingLicenceNumber: '',
    referredBy: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: string) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setError(null);

    if (!form.name.trim()) return setError('Enter your name');
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Enter a valid email address');
    if (!isValidIndianMobile(form.phone)) return setError('Enter a valid 10-digit mobile number');
    if (form.password.length < 6) return setError('Password must be at least 6 characters');

    setBusy(true);
    try {
      // Check the email before spending an SMS on a signup that will fail anyway.
      const available = await api<{ available: boolean }>('/auth/email-available', {
        method: 'POST',
        auth: false,
        body: { email: form.email.trim() },
      }).catch(() => ({ available: true }));

      if (!available.available) {
        setBusy(false);
        return setError('That email is already registered. Try signing in.');
      }

      const confirmation = await sendOtp(form.phone);

      // The confirmation handle cannot be serialised into router params, so it
      // is parked in a module-level store the next screen reads.
      setPendingSignup({
        confirmation,
        phone: toE164(form.phone),
        payload: {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          role,
          experienceYears: form.experienceYears ? Number(form.experienceYears) : undefined,
          drivingLicenceNumber: form.drivingLicenceNumber || undefined,
          referredBy: form.referredBy || undefined,
        },
      });

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
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.sub}>We will text a code to confirm your mobile number.</Text>

          <Card style={{ marginTop: 18 }}>
            {error ? (
              <View style={styles.error}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>I am a…</Text>
            <View style={styles.roleRow}>
              {ROLES.map((r) => (
                <Pressable
                  key={r.value}
                  onPress={() => setRole(r.value)}
                  style={[styles.roleCard, role === r.value && styles.roleCardActive]}
                >
                  <Text style={styles.roleIcon}>{r.icon}</Text>
                  <Text style={styles.roleLabel}>{r.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.roleHint}>{ROLES.find((r) => r.value === role)?.hint}</Text>

            <Text style={styles.label}>Full name</Text>
            <TextInput value={form.name} onChangeText={set('name')} placeholder="Your name" placeholderTextColor="#94a3b8" style={styles.input} />

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={form.email}
              onChangeText={set('email')}
              placeholder="you@example.com"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />

            <Text style={styles.label}>Mobile number</Text>
            <View style={styles.phoneRow}>
              <View style={styles.prefix}>
                <Text style={styles.prefixText}>+91</Text>
              </View>
              <TextInput
                value={form.phone}
                onChangeText={(t) => set('phone')(t.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit number"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                maxLength={10}
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
              />
            </View>

            <Text style={styles.label}>Password</Text>
            <TextInput
              value={form.password}
              onChangeText={set('password')}
              placeholder="At least 6 characters"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              style={styles.input}
            />

            {role === 'mechanic' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Mechanic details</Text>
                <Text style={styles.label}>Years of experience</Text>
                <TextInput
                  value={form.experienceYears}
                  onChangeText={(t) => set('experienceYears')(t.replace(/\D/g, '').slice(0, 2))}
                  placeholder="5"
                  placeholderTextColor="#94a3b8"
                  keyboardType="number-pad"
                  style={styles.input}
                />
                <Text style={styles.label}>Driving licence number</Text>
                <TextInput
                  value={form.drivingLicenceNumber}
                  onChangeText={set('drivingLicenceNumber')}
                  placeholder="TS0123456789"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="characters"
                  style={styles.input}
                />
                <Text style={styles.note}>An admin reviews these before you can take jobs.</Text>
              </View>
            )}

            <Text style={styles.label}>Referral code (optional)</Text>
            <TextInput
              value={form.referredBy}
              onChangeText={(t) => set('referredBy')(t.toUpperCase())}
              placeholder="Both of you get ₹100"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              style={styles.input}
            />

            <Button label="Send verification code" onPress={submit} loading={busy} style={{ marginTop: 8 }} />
          </Card>

          <Pressable onPress={() => router.replace('/login')} style={{ marginTop: 18 }}>
            <Text style={styles.link}>Already have an account? Log in</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '900', color: colors.text, marginTop: 8 },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6, marginTop: 12 },
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
  roleRow: { flexDirection: 'row', gap: 10 },
  roleCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  roleCardActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  roleIcon: { fontSize: 22 },
  roleLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 4 },
  roleHint: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  section: { marginTop: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 10 },
  note: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  error: { backgroundColor: colors.dangerLight, borderRadius: 12, padding: 12, marginBottom: 4 },
  errorText: { color: '#991b1b', fontSize: 13 },
  link: { textAlign: 'center', color: colors.brand, fontWeight: '700', fontSize: 14 },
});
