import http from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { assertProductionConfig, env } from './config/env.js';
import { initRealtime } from './realtime/hub.js';
import { startSimulator } from './services/simulator.js';

async function main() {
  // Refuse to boot a public server with a development JWT secret or no database.
  assertProductionConfig();

  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);

  // Moves demo mechanics along their route so live tracking has something to show
  // without a real phone streaming GPS. Disable with SIMULATE=false.
  // It stays on by default in production too, because this is a demo deployment
  // where nobody is actually riding to a customer.
  if (process.env.SIMULATE !== 'false') startSimulator();

  server.on('error', async (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[fatal] port ${env.port} is already in use — another RideRescue backend is probably still running.\n` +
          `        Stop it, or set PORT to something else in backend/.env.`
      );
    } else {
      console.error('[fatal]', err);
    }
    // Release the embedded MongoDB so the data directory is not left locked.
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  });

  // 0.0.0.0 so the container's port is reachable from outside it. Hosts that
  // only probe localhost will otherwise mark the service unhealthy.
  server.listen(env.port, '0.0.0.0', () => {
    console.log(`[api] RideRescue backend listening on port ${env.port}`);
    console.log(`[api] environment: ${env.isProduction ? 'production' : 'development'}`);
    console.log(`[api] dev mode: ${env.devMode ? 'on (OTP 123456, mock payments)' : 'off'}`);
    console.log(`[api] database: ${env.mongoUri ? 'external (MONGODB_URI)' : 'embedded (local disk)'}`);
  });

  // Flush the embedded database to disk on Ctrl+C so nothing is lost.
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n[api] shutting down...');
    server.close();
    await disconnectDatabase().catch((err) => console.error('[api] shutdown error:', err.message));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[fatal] failed to start:', err);
  process.exit(1);
});
