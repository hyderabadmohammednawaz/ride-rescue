import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errors.js';
import { env } from './config/env.js';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import serviceRoutes from './routes/services.js';
import bookingRoutes from './routes/bookings.js';
import partRoutes from './routes/parts.js';
import orderRoutes from './routes/orders.js';
import vendorRoutes from './routes/vendor.js';
import paymentRoutes from './routes/payments.js';
import mechanicRoutes from './routes/mechanic.js';
import notificationRoutes from './routes/notifications.js';
import assistantRoutes from './routes/assistant.js';
import adminRoutes from './routes/admin.js';
import supportRoutes from './routes/support.js';

export function createApp() {
  const app = express();

  // Behind Render/Fly/nginx the client IP arrives in X-Forwarded-For.
  app.set('trust proxy', 1);

  // With CORS_ORIGIN unset any origin is reflected, which suits local work.
  // In production it should be pinned to the deployed frontend.
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  // Render polls this to decide whether the instance is healthy.
  app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', devMode: env.devMode, time: new Date().toISOString() })
  );

  // A bare GET / is what a browser or uptime checker hits first.
  app.get('/', (req, res) =>
    res.json({
      name: 'RideRescue API',
      status: 'ok',
      docs: 'See README.md for the full route list',
      health: '/api/health',
    })
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/services', serviceRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/parts', partRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/vendor', vendorRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/mechanic', mechanicRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/support', supportRoutes);

  app.use((req, res) => res.status(404).json({ message: `No route for ${req.method} ${req.path}` }));
  app.use(errorHandler);

  return app;
}
