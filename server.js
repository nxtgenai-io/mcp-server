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

// Auth middleware
app.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
});

// Health
app.get('/health', (_, res) => res.json({ ok: true, model: MODEL }));

// Rate limit normalize
const normalizeLimiter = RateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many normalize_event requests, please try again later.' }
});

// Normalize & dedupe
app.post('/normalize_event', normalizeLimiter, async (req, res) => {
  const { message_id = '', phone = '', text = '', client_id = '' } = req.body || {};
  let duplicate = false;
  if (redis && message_id) {
    const set = await redis.set(`wa:${message_id}`, '1', 'NX', 'EX', 600);
    duplicate = (set !== 'OK');
  }
  return res.json({ duplicate, message_id, phone, client_id });
});

async function geminiIntent(text) {
  if (!GEMINI_KEY) {
    const t = (text || '').toLowerCase();
    let intent = 'GENERIC';
    if (t.includes('price') || t.includes('cost') || t.includes('pay')) intent = 'PAYMENT';
    else if (t.includes('book') || t.includes('meeting') || t.includes('call')) intent = 'BOOKING';
    else if (t.includes('hi') || t.includes('hello') || t.includes('help')) intent = 'INQUIRY';
    return { intent, reply_text: 'Namaste ji! Kaise madad kar sakti hoon? 😊', actions: [] };
  }

  const prompt = `Act as Riya (friendly Hindi+English, ≤ 450 chars).
Classify one of: INQUIRY, PAYMENT, BOOKING, FEEDBACK, GENERIC.
Return a short helpful reply.
User: ${text}`;

  const body = { contents: [{ role: 'user', parts: [{ text: prompt }]}] };
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  ).catch(() => null);

  const json = await resp?.json().catch(() => ({}));
  const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text || 'Thanks! We will help you shortly.';

  const t = (text || '').toLowerCase();
  let intent = 'INQUIRY';
  if (t.includes('price') || t.includes('cost') || t.includes('pay')) intent = 'PAYMENT';
  else if (t.includes('book') || t.includes('meeting')) intent = 'BOOKING';

  return { intent, reply_text: reply, actions: [] };
}

// AI intent
app.post('/ai_intent', async (req, res) => {
  const { text = '' } = req.body || {};
  const out = await geminiIntent(text);
  return res.json(out);
});

// Stubs (you can keep WhatsApp send in n8n)
app.post('/send_whatsapp', async (req, res) =>
  res.json({ message_id: 'wamid.' + crypto.randomBytes(6).toString('hex') })
);

app.post('/schedule_followup', async (req, res) => res.json({ scheduled: true }));

app.listen(PORT, () => console.log(`MCP listening on :${PORT}`));
