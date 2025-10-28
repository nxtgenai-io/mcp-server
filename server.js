// Minimal MCP HTTP server with /health, /normalize_event, /ai_intent, /send_whatsapp, /schedule_followup
// Uses Redis for idempotency on /normalize_event
// Env: MCP_PORT, MCP_API_KEY, MODEL_NAME, GEMINI_API_KEY, REDIS_URL

import express from 'express';
import crypto from 'crypto';
import Redis from 'ioredis';
import fetch from 'node-fetch';
import RateLimit from 'express-rate-limit';

const app = express();
app.use(express.json());

const PORT = process.env.MCP_PORT || 8080;
const API_KEY = process.env.MCP_API_KEY || 'changeme';
const MODEL = process.env.MODEL_NAME || 'gemini-flash';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;


// Rate limiter for /normalize_event endpoint
const normalizeLimiter = RateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 100,                   // limit each IP to 100 requests per windowMs
  message: { error: "Too many normalize_event requests, please try again later." }
});

// Simple Bearer auth for all endpoints
app.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// Health check
app.get('/health', (_, res) => {
  res.json({ ok: true, model: MODEL });
});

// Normalize & dedupe (idempotency key = message_id)
app.post('/normalize_event', normalizeLimiter, async (req, res) => {
  const { message_id = '', phone = '', text = '', client_id = '' } = req.body || {};
  let duplicate = false;
  if (redis && message_id) {
    // Set NX with 10 min TTL; if key exists, it's a duplicate
    const set = await redis.set(`wa:${message_id}`, '1', 'NX', 'EX', 600);
    duplicate = (set !== 'OK');
  }
  return res.json({ duplicate, message_id, phone, client_id });
});

// Minimal Gemini intent with graceful fallback if key missing
async function geminiIntent(text) {
  if (!GEMINI_KEY) {
    const t = (text || '').toLowerCase();
    let intent = 'GENERIC';
    if (t.includes('price') || t.includes('cost') || t.includes('pay')) intent = 'PAYMENT';
    else if (t.includes('book') || t.includes('meeting') || t.includes('call')) intent = 'BOOKING';
    else if (t.includes('hi') || t.includes('hello') || t.includes('help')) intent = 'INQUIRY';
    return {
      intent,
      reply_text: 'Namaste ji! Kaise madad kar sakti hoon? 😊',
      actions: []
    };
  }

  // Gemini API call (adjust endpoint/model/version if needed)
  const prompt = `Act as Riya (friendly Hindi+English, ≤ 450 chars).
Classify one of: INQUIRY, PAYMENT, BOOKING, FEEDBACK, GENERIC.
Return a short helpful reply.\nUser: ${text}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }]}]
  };

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  ).catch(() => null);

  const json = await resp?.json().catch(() => ({}));
  const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text || 'Thanks! We will help you shortly.';

  // Simple heuristic intent if the model does not return one explicitly
  let intent = 'INQUIRY';
  const t = (text || '').toLowerCase();
  if (t.includes('price') || t.includes('cost') || t.includes('pay')) intent = 'PAYMENT';
  else if (t.includes('book') || t.includes('meeting')) intent = 'BOOKING';

  return { intent, reply_text: reply, actions: [] };
}

// AI intent endpoint
app.post('/ai_intent', async (req, res) => {
  const { text = '' } = req.body || {};
  const out = await geminiIntent(text);
  return res.json(out);
});

// Stub send_whatsapp (you can keep real send in n8n for now)
app.post('/send_whatsapp', async (req, res) => {
  return res.json({ message_id: 'wamid.' + crypto.randomBytes(6).toString('hex') });
});

// Stub schedule_followup
app.post('/schedule_followup', async (req, res) => {
  return res.json({ scheduled: true });
});

app.listen(PORT, () => {
  console.log(`MCP listening on :${PORT}`);
});
