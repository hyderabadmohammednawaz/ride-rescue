import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

/**
 * Firebase client configuration.
 *
 * These values are NOT secrets. Every Firebase web app ships them inside its
 * JavaScript bundle by design — Google's own docs say so. What actually protects
 * the project is the authorised-domain list (only ride-rescue-57l9.vercel.app and
 * localhost may start a sign-in), the SMS region policy, and the fact that our
 * backend verifies the signature of every ID token before trusting it.
 *
 * The service-account key is the real secret, and that lives only in Render's
 * FIREBASE_SERVICE_ACCOUNT — never here.
 *
 * Env vars still win when set, so a different Firebase project can be swapped in
 * without touching code.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyA-VoVpoIxnljLRm07vuEOvYFIdXXaDEeo',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'riderescue-94e68.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'riderescue-94e68',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'riderescue-94e68.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID || '78522577551',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:78522577551:web:f004e748a87a306423b6fa',
};

/** The project the browser mints tokens for. Must match the backend's, or every token is rejected. */
export const firebaseProjectId = firebaseConfig.projectId;

/**
 * Next.js renders these pages on the server first, where `window` does not exist
 * and Firebase Auth cannot initialise. Everything here is therefore called only
 * from client components, after mount.
 */
export function firebaseAuth(): Auth {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}
