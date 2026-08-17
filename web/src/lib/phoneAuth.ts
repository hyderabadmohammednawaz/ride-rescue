import {
  RecaptchaVerifier,
  getIdToken,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';

/**
 * Firebase Phone Authentication for the web app.
 *
 * Mirrors mobile/lib/phoneAuth.ts so both clients prove ownership of a number
 * the same way: the browser talks to Firebase directly, Firebase sends the SMS
 * and checks the code, and we forward the resulting ID token to our backend,
 * which verifies its signature. That verification is what makes the claim
 * trustworthy — a client could otherwise POST any phone number it liked.
 *
 * Google is the DLT-registered sender, so none of the Indian SMS registration
 * (entity, header, template approval) applies to us.
 *
 * The one thing the web needs that native does not is a reCAPTCHA verifier:
 * Firebase will not send a browser-initiated SMS without it, because a web page
 * has no app-signature equivalent to prove it is not a bot.
 */

export type Confirmation = ConfirmationResult;

/** Indian numbers are typed as 10 digits; Firebase wants E.164. */
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

/**
 * A reCAPTCHA verifier is single-use: once it has authorised one SMS it cannot
 * authorise another, and reusing it is the usual cause of a resend failing with
 * "captcha-check-failed". So each send builds a fresh one and disposes of the
 * previous, rather than keeping one around for the life of the page.
 */
let verifier: RecaptchaVerifier | null = null;

export const RECAPTCHA_CONTAINER_ID = 'recaptcha-container';

function freshVerifier() {
  clearVerifier();
  verifier = new RecaptchaVerifier(firebaseAuth(), RECAPTCHA_CONTAINER_ID, {
    // Invisible: no puzzle unless Google decides the visitor looks automated.
    size: 'invisible',
  });
  return verifier;
}

/** Disposes the current verifier. Safe to call when there is none. */
export function clearVerifier() {
  try {
    verifier?.clear();
  } catch {
    // Already torn down, e.g. the container was unmounted first.
  }
  verifier = null;
}

/** Sends the OTP. Returns a confirmation handle used to check the code. */
export async function sendOtp(phone: string): Promise<Confirmation> {
  return signInWithPhoneNumber(firebaseAuth(), toE164(phone), freshVerifier());
}

/** Resending is just a fresh verification, with a fresh captcha. */
export const resendOtp = sendOtp;

/** Checks the code and returns the Firebase ID token for our backend. */
export async function confirmOtp(confirmation: Confirmation, code: string): Promise<string> {
  const credential = await confirmation.confirm(code);
  if (!credential?.user) throw new Error('Could not complete verification. Please try again.');
  const token = await getIdToken(credential.user);
  if (!token) throw new Error('Could not complete verification. Please try again.');
  return token;
}

/** Signs out of Firebase; our own session is separate and cleared by useAuth. */
export async function signOutFirebase() {
  try {
    const auth = firebaseAuth();
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
    'auth/quota-exceeded': 'SMS limit reached on this project. Try again later.',
    'auth/network-request-failed': 'No internet connection.',
    'auth/captcha-check-failed': 'The reCAPTCHA check failed. Reload the page and try again.',
    // Raised when the page's origin is not in Firebase's authorised-domain list,
    // which is the first thing to check after deploying to a new URL.
    'auth/invalid-app-credential':
      'This site is not authorised for phone sign-in. Add its domain in Firebase > Authentication > Settings > Authorized domains.',
  };
  return map[code] || err?.message || 'Something went wrong. Please try again.';
}
