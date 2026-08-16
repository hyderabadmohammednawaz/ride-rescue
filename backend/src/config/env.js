import dotenv from 'dotenv';
dotenv.config();

const DEV_JWT_SECRET = 'ride-rescue-dev-secret-change-me';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Dev mode returns OTPs in API responses and settles payments against a mock
 * gateway. That is exactly what you want on a laptop and a serious hole on a
 * public URL, so it defaults to OFF in production and has to be opted into.
 */
const devMode = (process.env.DEV_MODE ?? (isProduction ? 'false' : 'true')).toLowerCase() !== 'false';

export const env = {
  isProduction,
  // Render (and most hosts) inject PORT; it is not ours to choose.
  port: parseInt(process.env.PORT || '5000', 10),
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  devMode,
  // Comma-separated list of allowed web origins. Empty = reflect any origin,
  // which is fine locally but should be pinned to your deployed frontend.
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
};

/**
 * Fails fast on misconfiguration that would be dangerous in production, rather
 * than booting a public server that quietly signs tokens with a secret printed
 * in this repository.
 */
export function assertProductionConfig() {
  if (!isProduction) return;

  const fatal = [];
  const warnings = [];

  if (env.jwtSecret === DEV_JWT_SECRET) {
    fatal.push('JWT_SECRET is still the development default — anyone reading this repo could forge a login token.');
  }
  if (env.jwtSecret.length < 24) {
    fatal.push('JWT_SECRET is too short; use at least 24 random characters.');
  }
  if (!env.mongoUri) {
    fatal.push(
      'MONGODB_URI is not set. The embedded MongoDB writes to local disk, which most hosts wipe on every restart — point this at MongoDB Atlas.'
    );
  }
  if (env.devMode) {
    warnings.push('DEV_MODE is on in production: OTPs are returned in API responses and payments are mocked.');
  }
  if (env.corsOrigins.length === 0) {
    warnings.push('CORS_ORIGIN is not set, so any website may call this API. Set it to your frontend URL.');
  }

  warnings.forEach((w) => console.warn(`[config] WARNING: ${w}`));

  if (fatal.length > 0) {
    console.error('\n[config] Refusing to start in production:\n' + fatal.map((f) => `  - ${f}`).join('\n') + '\n');
    process.exit(1);
  }
}
