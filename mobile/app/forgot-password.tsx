import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { useAuth, type User } from '../lib/auth';
import { confirmOtp, describeAuthError, isValidIndianMobile, resendOtp, sendOtp, toE164, type Confirmation } from '../lib/phoneAuth';
import { Button, Card } from '../components/ui';
import { colors } from '../lib/theme';

const RESEND_SECONDS = 30;

/**
 * Password reset by SMS.
 *
 * The phone app had no reset at all: forgetting your password meant losing the
 * account. The email path could not have helped anyway — on a deployed server
 * the code goes only to the server log and no mail provider is configured.
 *
 * Firebase already proves ownership of a number for signing up and signing in,
 * and that proof is exactly what a reset needs, so this reuses it.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { adoptSession } = useAuth();

  const [phone, setPhone] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirmation || seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds, confirmation]);

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      if (!isValidIndianMobile(phone)) {
        throw new Error('Enter a 10-digit Indian mobile number starting 6, 7, 8 or 9.');
      }
      setConfirmation(await sendOtp(phone));
      setSeconds(RESEND_SECONDS);
    } catch (err: any) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!confirmation) return;
    setError(null);
    setBusy(true);
    try {
      const idToken = await confirmOtp(confirmation, code, phone);
      const res = await api<{ token: string; user: User }>('/auth/phone/reset-password', {
        method: 'POST',
        auth: false,
        body: { idToken, newPassword },
      });
      const user = await adoptSession(res.token, res.user);
      router.replace(user.role === 'mechanic' ? '/mechanic' : '/customer');
    } catch (err: any) {
      setError(
        err.status === 404 ? 'No account uses that mobile number. Create one instead.' : describeAuthError(err)
      );
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setBusy(true);
    try {
      setConfirmation(await resendOtp(phone));
      setCode('');
      setSeconds(RESEND_SECONDS);
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
          <Text style={styles.title}>{confirmation ? 'Choose a new password' : 'Reset your password'}</Text>
          <Text style={styles.sub}>
            {confirmation
              ? `Enter the code sent to ${toE164(phone)}, then pick a new password.`
              : 'We will text a one-time password to your registered mobile number.'}
          </Text>

          <Card style={{ marginTop: 20 }}>
            {error ? (
              <View style={styles.error}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {!confirmation ? (
              <>
                <Text style={styles.label}>Mobile number</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="10-digit mobile"
                  placeholderTextColor="#94a3b8"
                  keyboardType="number-pad"
                  maxLength={10}
                  autoFocus
                  style={styles.input}
                />
                <Text style={styles.hint}>Use the number your account was created with.</Text>
                <Button label="Send code" onPress={sendCode} loading={busy} style={{ marginTop: 16 }} />
              </>
            ) : (
              <>
                <Text style={styles.label}>One-time password</Text>
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

                <Text style={styles.label}>New password</Text>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  style={styles.input}
                />

                <Button
                  label="Set new password"
                  onPress={reset}
                  loading={busy}
                  disabled={code.length !== 6 || newPassword.length < 6}
                  style={{ marginTop: 16 }}
                />

                <Pressable onPress={resend} disabled={seconds > 0 || busy} style={{ marginTop: 14 }}>
                  <Text style={[styles.resend, seconds > 0 && styles.resendOff]}>
                    {seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
                  </Text>
                </Pressable>
              </>
            )}
          </Card>

          <Pressable onPress={() => router.replace('/login')} style={{ marginTop: 20 }}>
            <Text style={styles.link}>Back to sign in</Text>
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
  codeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 12,
    textAlign: 'center',
    color: colors.text,
    backgroundColor: '#fff',
  },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  resend: { textAlign: 'center', color: colors.brand, fontWeight: '700', fontSize: 14 },
  resendOff: { color: colors.textMuted },
  error: { backgroundColor: colors.dangerLight, borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: '#991b1b', fontSize: 13 },
  link: { textAlign: 'center', color: colors.brand, fontWeight: '700', fontSize: 14 },
});
