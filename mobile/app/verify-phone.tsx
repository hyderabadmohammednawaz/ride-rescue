import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useAuth, type User } from '../lib/auth';
import {
  confirmOtp,
  describeAuthError,
  onAutoVerified,
  resendOtp,
  tokenIfAlreadyVerified,
  type Confirmation,
} from '../lib/phoneAuth';
import { clearPendingSignup, getPendingSignup, updateConfirmation } from '../lib/signupDraft';
import { Button, Card } from '../components/ui';
import { colors } from '../lib/theme';

const RESEND_SECONDS = 30;

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const { adoptSession } = useAuth();

  // Snapshot the draft once. The phone and payload never change while this
  // screen is open, and re-reading on every render was how the stale
  // confirmation bug crept in.
  const draft = useRef(getPendingSignup()).current;

  // The confirmation DOES change - a resend replaces it - so it lives in state.
  // Holding it in the module store alone meant the component kept using the
  // dead handle and every resent code was rejected.
  const [confirmation, setConfirmation] = useState<Confirmation | null>(draft?.confirmation ?? null);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const finishing = useRef(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  // Reached directly, e.g. after a reload in development.
  useEffect(() => {
    if (!draft) router.replace('/login');
  }, [draft, router]);

  const goHome = useCallback(
    (user: User) => {
      clearPendingSignup();
      if (user.role === 'mechanic') router.replace('/mechanic');
      else if (user.role === 'customer') router.replace('/customer');
      else setError('Vendor and admin accounts use the web dashboard.');
    },
    [router]
  );

  /** Exchanges a verified Firebase token for a RideRescue session. */
  const completeWithToken = useCallback(
    async (idToken: string) => {
      if (finishing.current || !draft) return;
      finishing.current = true;
      setBusy(true);
      try {
        const path = draft.loginOnly ? '/auth/phone/login' : '/auth/phone/register';
        const body = draft.loginOnly ? { idToken } : { idToken, ...draft.payload };
        const res = await api<{ token: string; user: User }>(path, { method: 'POST', auth: false, body });
        goHome(await adoptSession(res.token, res.user));
      } catch (err: any) {
        finishing.current = false;
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [draft, adoptSession, goHome]
  );

  // Android can verify without the user typing anything (Play Integrity instant
  // verification, or Play services auto-retrieving the SMS). Catch that and
  // finish, instead of leaving the user staring at a code box for a session
  // that has already been used.
  useEffect(() => {
    if (!draft) return;
    const unsubscribe = onAutoVerified(draft.phone, (idToken) => {
      completeWithToken(idToken);
    });
    return unsubscribe;
  }, [draft, completeWithToken]);

  if (!draft) return null;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      // If auto-verification already happened, the code box is moot.
      const already = await tokenIfAlreadyVerified(draft.phone);
      if (already) {
        await completeWithToken(already);
        return;
      }

      if (!confirmation) {
        setError('That verification is no longer valid. Tap "Resend code".');
        return;
      }

      const idToken = await confirmOtp(confirmation, code, draft.phone);
      await completeWithToken(idToken);
    } catch (err: any) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const next = await resendOtp(draft.phone);
      setConfirmation(next); // what actually makes the new code usable
      updateConfirmation(next);
      setCode('');
      setSeconds(RESEND_SECONDS);
      setInfo('A new code is on its way.');
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
          <Text style={styles.title}>Verify your number</Text>
          <Text style={styles.sub}>
            We sent a 6-digit code to <Text style={styles.phone}>{draft.phone}</Text>
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
