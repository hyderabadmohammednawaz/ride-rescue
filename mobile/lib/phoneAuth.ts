import {
  getAuth,
  getIdToken,
  onAuthStateChanged,
  signInWithPhoneNumber,
  signOut,
} from '@react-native-firebase/auth';

/**
 * Firebase Phone Authentication.
 *
 * The phone talks to Firebase directly: Firebase sends the SMS, checks the code,
 * and hands back an ID token. We forward that token to our backend, which
 * verifies its signature — that is what proves the caller owns the number.
 *
 * Google is the DLT-registered sender, so none of the Indian SMS registration
 * (entity, header, template approval) applies to us.
 *
 * react-native-firebase v26 is modular-only: there is no default export and no
 * FirebaseAuthTypes namespace, so everything below uses the free functions.
 */

/** The handle returned by signInWithPhoneNumber, used to confirm the code. */
export type Confirmation = Awaited<ReturnType<typeof signInWithPhoneNumber>>;

/**
 * Indian numbers are entered as 10 digits; Firebase wants E.164.
 * Anything already carrying a country code is passed through untouched.
 */
export function toE164(input: string, defaultCountry = '+91') {
  const trimmed = String(input || '').trim();
  if (trimmed.startsWith('+')) return trimmed.replace(/[^\d+]/g, '');

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `${defaultCountry}${digits}`;
  // 91XXXXXXXXXX typed without the plus
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `${defaultCountry}${digits.slice(-10)}`;
}

export function isValidIndianMobile(input: string) {
  const digits = String(input || '').replace(/\D/g, '').slice(-10);
  // Indian mobile numbers are 10 digits starting 6-9.
  return /^[6-9]\d{9}$/.test(digits);
}

/** Sends the OTP. Returns a confirmation handle used to check the code. */
export function sendOtp(phone: string): Promise<Confirmation> {
  return signInWithPhoneNumber(getAuth(), toE164(phone));
}

/**
 * Re-sends by starting a fresh verification. The modular API's third argument is
 * a web ApplicationVerifier rather than the old forceResend boolean, so a plain
 * second call is the way to resend on native.
 */
export function resendOtp(phone: string): Promise<Confirmation> {
  return signInWithPhoneNumber(getAuth(), toE164(phone));
}

/** Last 10 digits, so +919000000010 and 9000000010 compare equal. */
const digits10 = (v: string) => String(v || '').replace(/\D/g, '').slice(-10);

/**
 * If Firebase already signed this number in by itself, returns its ID token.
 *
 * On Android, Play Integrity can verify instantly and Google Play services can
 * auto-retrieve the SMS — either path completes sign-in without us calling
 * confirm(). The verification session is then spent, so a later confirm() fails
 * with "session expired" even though the user did nothing wrong. Checking for an
 * already-signed-in user first is what stops that misleading error.
 */
export async function tokenIfAlreadyVerified(phone: string): Promise<string | null> {
  const user = getAuth().currentUser;
  if (!user?.phoneNumber) return null;
  if (digits10(user.phoneNumber) !== digits10(phone)) return null;
  return getIdToken(user, true).catch(() => null);
}

/** Fires when Firebase completes verification on its own. */
export function onAutoVerified(phone: string, handler: (idToken: string) => void) {
  return onAuthStateChanged(getAuth(), async (user) => {
    if (!user?.phoneNumber) return;
    if (digits10(user.phoneNumber) !== digits10(phone)) return;
    const token = await getIdToken(user, true).catch(() => null);
    if (token) handler(token);
  });
}

/** Checks the code and returns the Firebase ID token for our backend. */
export async function confirmOtp(
  confirmation: Confirmation,
  code: string,
  phone?: string
): Promise<string> {
  try {
    const credential = await confirmation.confirm(code);
    if (!credential?.user) throw new Error('Could not complete verification. Please try again.');
    const token = await getIdToken(credential.user);
    if (!token) throw new Error('Could not complete verification. Please try again.');
    return token;
  } catch (err: any) {
    // The session may have been consumed by auto-verification rather than
    // actually expiring. If Firebase already has this number signed in, that is
    // a success, not a failure.
    if (phone) {
      const existing = await tokenIfAlreadyVerified(phone);
      if (existing) return existing;
    }
    throw err;
  }
}

/** Signs out of Firebase; our own session is separate and cleared by useAuth. */
export async function signOutFirebase() {
  try {
    const auth = getAuth();
    if (auth.currentUser) await signOut(auth);
  } catch {
    // Not being signed in to Firebase is fine.
  }
}

/** Firebase error codes are not presentable; map the ones users actually hit. */
export function describeAuthError(err: any): string {
  const code = err?.code || '';
  const map: Record<string, string> = {
    'auth/invalid-phone-number': 'That mobile number does not look right.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/invalid-verification-code': 'That code is incorrect. Check it and try again.',
    'auth/code-expired': 'That code expired. Request a new one.',
    'auth/session-expired': 'That code expired. Request a new one.',
    'auth/quota-exceeded': 'SMS limit reached on this project. Use a test number, or try later.',
    'auth/network-request-failed': 'No internet connection.',
    'auth/missing-client-identifier':
      'This build is not registered with Firebase. Its SHA-1 fingerprint needs adding in the Firebase console.',
  };
  return map[code] || err?.message || 'Something went wrong. Please try again.';
}
