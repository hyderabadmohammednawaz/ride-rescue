import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Verifies the ID tokens produced by Firebase Phone Authentication.
 *
 * The phone never sends us an OTP. It talks to Firebase directly, Firebase does
 * the SMS and the code check, and the app hands us a signed ID token. We verify
 * that token's signature here, which is what proves the caller really controls
 * the number — a client could otherwise just claim any phone number it liked.
 *
 * Credentials come from FIREBASE_SERVICE_ACCOUNT: the service-account JSON, either
 * raw or base64-encoded (base64 avoids newline mangling in dashboards like Render).
 */
let initError = null;
let projectId = null;

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) return null;

  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const parsed = JSON.parse(text);

  // Dashboards frequently turn the key's "\n" sequences into literal backslash-n.
  if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  return parsed;
}

function init() {
  if (getApps().length > 0) return true;
  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) return false;
    initializeApp({ credential: cert(serviceAccount) });
    projectId = serviceAccount.project_id;
    console.log(`[firebase] phone auth ready (project ${projectId})`);
    return true;
  } catch (err) {
    initError = err.message;
    console.error('[firebase] could not initialise:', err.message);
    return false;
  }
}

const ready = init();

export const phoneAuthConfigured = () => ready;
export const phoneAuthError = () => initError;

/**
 * The Firebase project this server verifies tokens against. Not a secret — it
 * also ships inside the app's google-services.json — and exposing it turns an
 * otherwise invisible mismatch (app minting tokens for project A, server
 * verifying against project B) into something you can see at a glance.
 */
export const phoneAuthProject = () => projectId;

/**
 * Returns the E.164 phone number proven by the token, or throws.
 */
export async function verifyPhoneToken(idToken) {
  if (!ready) {
    throw new Error(
      'Phone sign-in is not configured on the server. Set FIREBASE_SERVICE_ACCOUNT to enable it.'
    );
  }
  if (!idToken || typeof idToken !== 'string') throw new Error('Missing Firebase ID token');

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken);
  } catch (err) {
    // Expired tokens are the common case and deserve a clearer message than
    // Firebase's default, because the app can simply re-verify.
    if (err.code === 'auth/id-token-expired') {
      throw new Error('That verification expired. Please request a new code.');
    }
    throw new Error('Could not verify that phone number. Please try again.');
  }

  if (!decoded.phone_number) {
    throw new Error('That sign-in did not include a phone number.');
  }
  return { phone: decoded.phone_number, uid: decoded.uid };
}

/** 9000000010 / +919000000010 / 91 9000000010 all reduce to the same key. */
export function normalisePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}
