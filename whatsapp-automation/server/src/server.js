// TurfFlow Production Backend & WhatsApp Automation Server
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './routes/apiRoutes.js';
import { webhookRouter } from './routes/webhookRoutes.js';
import { store } from './data/store.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// Webhook raw parsing for signature check
app.use('/api/webhooks', webhookRouter);

// Standard JSON middleware for API
app.use(express.json());

// Main REST API
app.use('/api', apiRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'TurfFlow Backend & WhatsApp Agent API',
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

// Redirect root to simulator or API health
app.get('/', (req, res) => {
  res.redirect('/simulator');
});

const server = app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 TurfFlow Backend & WhatsApp Automation Server Ready!`);
  console.log(`======================================================`);
  console.log(`📡 REST API Root:        http://localhost:${PORT}/api`);
  console.log(`🩺 Health Status:        http://localhost:${PORT}/api/health`);
  console.log(`📲 WhatsApp Simulator:   http://localhost:${PORT}/simulator`);
  console.log(`🔔 Razorpay Webhook:     http://localhost:${PORT}/api/webhooks/razorpay`);
  console.log(`💬 WhatsApp Webhook:     http://localhost:${PORT}/api/webhooks/whatsapp`);
  console.log(`======================================================\n`);
});

export default app;
