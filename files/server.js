require('dotenv').config();
const express = require('express');
const cors = require('cors');

const generateRoute = require('./routes/generate');
const exportRoute = require('./routes/export');
const paymentRoute = require('./routes/payment');

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS — restrict to known frontend origins ───────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  }
}));

// ── Stripe webhook needs the raw body — must be registered before express.json() ─
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));

// ── Minimal in-memory rate limiting per IP ───────────────────────
// Good enough for a small test launch. Replace with a proper store
// (Redis, etc.) before any meaningful traffic.
const requestLog = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 12; // generous enough for one full generation (3 calls) plus retries

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const entry = requestLog.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  requestLog.set(ip, entry);

  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }
  next();
}

app.use('/api/generate', rateLimit);
app.use('/api/export', rateLimit);

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/generate', generateRoute);
app.use('/api/export', exportRoute);
app.use('/api/payment', paymentRoute);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Obit AI backend running on port ${PORT}`);
});
