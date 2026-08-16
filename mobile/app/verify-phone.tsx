import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useAuth, type User } from '../lib/auth';
import { confirmOtp, describeAuthError, resendOtp } from '../lib/phoneAuth';
import { clearPendingSignup, getPendingSignup, updateConfirmation } from '../lib/signupDraft';
import { Button, Card } from '../components/ui';
import { colors } from '../lib/theme';

const RESEND_SECONDS = 30;

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const { adoptSession } = useAuth();
  const pending = getPendingSignup();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  // Reached directly, e.g. after a reload in development.
  useEffect(() => {
    if (!pending) router.replace('/login');
  }, [pending, router]);

  if (!pending) return null;

  const goHome = (user: User) => {
    clearPendingSignup();
    if (user.role === 'mechanic') router.replace('/mechanic');
    else if (user.role === 'customer') router.replace('/customer');
    else setError('Vendor and admin accounts use the web dashboard.');
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const idToken = await confirmOtp(pending.confirmation, code);

      if (pending.loginOnly) {
        const res = await api<{ token: string; user: User }>('/auth/phone/login', {
          method: 'POST',
          auth: false,
          body: { idToken },
        });
        goHome(await adoptSession(res.token, res.user));
        return;
      }

      const res = await api<{ token: string; user: User }>('/auth/phone/register', {
        method: 'POST',
        auth: false,
        body: { idToken, ...pending.payload },
      });
      goHome(await adoptSession(res.token, res.user));
    } catch (err: any) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    try {
      const confirmation = await resendOtp(pending.phone);
      updateConfirmation(confirmation);
      setSeconds(RESEND_SECONDS);
      setInfo('A new code is on its way.');
    } catch (err: any) {
      setError(describeAuthError(err));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Verify your number</Text>
          <Text style={styles.sub}>
            We sent a 6-digit code to <Text style={styles.phone}>{pending.phone}</Text>
          </Text>

          <Card style={{ marginTop: 20 }}>
            {error ? (
              <View style={styles.error}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {info ? (
              <View style={styles.info}>
                <Text style={styles.infoText}>{info}</Text>
              </View>
            ) : null}

            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              placeholderTextColor="#cbd5e1"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              style={styles.codeInput}
            />

            <Button
              label="Verify and continue"
              onPress={submit}
              loading={busy}
              disabled={code.length !== 6}
              style={{ marginTop: 16 }}
            />

            <Pressable onPress={resend} disabled={seconds > 0} style={{ marginTop: 14 }}>
              <Text style={[styles.resend, seconds > 0 && styles.resendDisabled]}>
                {seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
              </Text>
            </Pressable>
          </Card>

          <Pressable
            onPress={() => {
              clearPendingSignup();
              router.replace('/login');
            }}
            style={{ marginTop: 20 }}
          >
            <Text style={styles.link}>Use a different number</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, paddingTop: 40 },
  title: { fontSize: 24, fontWeight: '900', color: colors.text },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: 6 },
  phone: { fontWeight: '800', color: colors.text },
  codeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 16,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 14,
    textAlign: 'center',
    color: colors.text,
    backgroundColor: '#fff',
  },
  resend: { textAlign: 'center', color: colors.brand, fontWeight: '700', fontSize: 14 },
  resendDisabled: { color: colors.textMuted },
  error: { backgroundColor: colors.dangerLight, borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: '#991b1b', fontSize: 13 },
  info: { backgroundColor: colors.successLight, borderRadius: 12, padding: 12, marginBottom: 12 },
  infoText: { color: '#065f46', fontSize: 13 },
  link: { textAlign: 'center', color: colors.brand, fontWeight: '700', fontSize: 14 },
});
