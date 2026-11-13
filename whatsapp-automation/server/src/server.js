// Global process guards to ensure 24/7 resilience against transient network/socket drops
process.on('uncaughtException', (err) => {
  console.error('⚠️ [UncaughtException Guard]:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [UnhandledRejection Guard]:', reason?.message || reason);
});

// TurfFlow Unified Production Backend & WhatsApp Automation Server
import './env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { apiRouter } from './routes/apiRoutes.js';
import { webhookRouter } from './routes/webhookRoutes.js';
import { store } from './data/store.js';
import { BookingService } from './services/bookingService.js';
import { SupabaseService } from './services/supabaseService.js';
import { WhatsAppService } from './services/whatsappService.js';
import { ReminderScheduler } from './services/reminderScheduler.js';
import { isSupabaseConfigured, testSupabaseConnection } from './data/supabaseClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime
});

// Production Security Headers via Helmet
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS lockdown: whitelist allowed origin URLs
const clientOrigin = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
const allowedOrigins = [
  clientOrigin,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV === 'production') {
      logger.warn({ blockedOrigin: origin }, 'Blocked request by CORS policy');
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    }
    return callback(null, true);
  },
  credentials: true
}));

// Webhook raw parsing for signature check
app.use('/api/webhooks', webhookRouter);

// Standard JSON middleware for API
app.use(express.json());

// Main REST API
app.use('/api', apiRouter);

// Direct shortcut for Razorpay payment links (e.g. http://localhost:5000/pay/TRF-...)
app.get('/pay/:ref', (req, res) => {
  res.redirect('/api/pay/' + req.params.ref);
});

// Supabase Status Endpoint
app.get('/api/supabase/status', async (req, res) => {
  const conn = await testSupabaseConnection();
  res.json({
    configured: isSupabaseConfigured(),
    realtimeActive: Boolean(SupabaseService.realtimeChannel),
    connection: conn,
    stats: {
      courts: store.getCourts().length,
      bookings: store.getBookings().length,
      customers: store.getCustomers().length,
      activeLocks: store.locks.size
    }
  });
});

// Force Supabase Sync / Hydration
app.post('/api/supabase/sync', async (req, res) => {
  const success = await SupabaseService.hydrateStore(store);
  if (success && !SupabaseService.realtimeChannel) {
    SupabaseService.subscribeToRealtime(store);
  }
  res.json({
    success,
    message: success ? 'Synchronized store with Supabase PostgreSQL!' : 'Could not hydrate from Supabase.',
    stats: {
      courts: store.getCourts().length,
      bookings: store.getBookings().length,
      customers: store.getCustomers().length
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'TurfFlow Backend & WhatsApp Agent API',
    databaseMode: isSupabaseConfigured() ? 'supabase-postgresql' : 'in-memory-fallback',
    supabaseRealtime: Boolean(SupabaseService.realtimeChannel),
    stats: {
      venues: 1,
      courts: store.getCourts().length,
      bookings: store.getBookings().length,
      activeLocks: store.locks.size,
      notificationsSent: store.getNotifications().length
    }
  });
});

// Serve interactive WhatsApp simulator
const simulatorPath = path.resolve(__dirname, '../../simulator');
app.use('/simulator', express.static(simulatorPath));

// Serve production frontend build if available
const distPath = path.resolve(__dirname, '../../../dist');
app.use(express.static(distPath));

// Fallback to React index.html for client routes (or redirect to /simulator if dist not built)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/simulator')) {
    return next();
  }
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.redirect('/simulator');
});

// Global error handling middleware with structured logging
app.use((err, req, res, next) => {
  logger.error({ err: err?.message || err, url: req.url, method: req.method }, 'Unhandled Express API Error');
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error occurred.' : (err?.message || 'Server error'),
    code: err.code || 'INTERNAL_ERROR'
  });
});

// Boot and initialize Supabase synchronization
async function startServer() {
  if (isSupabaseConfigured()) {
    console.log('⚡ Initializing Supabase PostgreSQL hydration & Realtime sync...');
    await SupabaseService.hydrateStore(store);
    SupabaseService.subscribeToRealtime(store);
  } else {
    console.log('ℹ️  Supabase URL/Key not configured in .env. Running in resilient in-memory mode.');
  }

  // Launch Baileys WhatsApp Multi-Device Agent
  const targetPhone = process.env.WHATSAPP_PHONE_NUMBER || '9579158374';
  console.log(`⚡ Launching WhatsApp Multi-Device Agent for +${targetPhone}...`);
  WhatsAppService.init({ usePairingCode: true, targetPhoneNumber: targetPhone }).catch(err => {
    console.warn('⚠️ WhatsApp initialization notice:', err.message);
  });

  // Start automated 1-hour matchday reminder background service
  ReminderScheduler.start();

  // Start 15-second auto-expiration sweeper for unpaid WhatsApp holds (5-minute TTL)
  setInterval(() => {
    BookingService.expireUnpaidPendingBookings();
  }, 15000);

  const server = app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 TurfFlow Unified Platform Server Ready (Site + WhatsApp Agent)`);
    console.log(`======================================================`);
    console.log(`🌐 Web App & API:        http://localhost:${PORT}`);
    console.log(`📡 REST API Root:        http://localhost:${PORT}/api`);
    console.log(`🩺 Health Status:        http://localhost:${PORT}/api/health`);
    console.log(`🗄️  Supabase Status:     http://localhost:${PORT}/api/supabase/status`);
    console.log(`📲 WhatsApp Simulator:   http://localhost:${PORT}/simulator`);
    console.log(`🔔 Razorpay Webhook:     http://localhost:${PORT}/api/webhooks/razorpay`);
    console.log(`💬 WhatsApp Webhook:     http://localhost:${PORT}/api/webhooks/whatsapp`);
    console.log(`======================================================\n`);
  });

  return server;
}

// Start if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch(err => {
    console.error('Fatal server boot error:', err);
  });
}

export default app;
