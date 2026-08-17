/**
 * NEXT_PUBLIC_* values are inlined into the client bundle at build time, so a
 * missing one does not fail — it silently ships whatever the fallback is. That
 * is how a production deploy ended up calling http://localhost:5000: the build
 * ran before the variable existed, and nothing complained.
 *
 * Falling back to localhost is right for local development and wrong anywhere
 * else, so on Vercel (VERCEL is set only there) a missing value is a hard error
 * rather than a broken deployment that looks fine until someone clicks Log in.
 */
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

if (process.env.VERCEL && !apiUrl) {
  throw new Error(
    'NEXT_PUBLIC_API_URL is not set. Add it in Vercel > Settings > Environment ' +
      'Variables (e.g. https://riderescue-api.onrender.com) and redeploy. ' +
      'Without it the app would be built pointing at http://localhost:5000.'
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: apiUrl || 'http://localhost:5000',
  },
};

export default nextConfig;
