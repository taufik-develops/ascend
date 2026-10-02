/**
 * server.js
 * ---------
 * This is the BACKEND. Its single most important job: it is the only place
 * that ever touches your Gemini API key. The browser never sees the key.
 *
 * Flow:  browser  ->  this server  ->  Google Gemini  ->  this server  ->  browser
 *
 * Run it with:  npm start
 */

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const BRAND = require('./brand');
const {
  SCANNERS,
  CHAT_SYSTEM,
  VOICE_PROMPTS,
  VOICE_FEEDBACK_PROMPT
} = require('./prompts');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const IS_PROD = process.env.NODE_ENV === 'production';

// Hosting platforms (Render, Railway, Fly) sit behind a proxy. Without this,
// rate limiting would see every visitor as the same IP and throttle everyone.
app.set('trust proxy', 1);

// Accept uploads up to 12 MB, kept in memory (never written to disk).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

app.use(express.json({ limit: '2mb' }));
// no-cache: during development, always serve the newest HTML/CSS/JS.
// Without this, browsers happily keep an old app.js and you "fix" bugs that
// are already fixed. Remove this when you deploy to production.
// Hosting platforms sit behind a proxy; this makes req IPs correct.

// In development: never cache, so you always see your latest edit.
// In production: cache static files for an hour (faster app, less data on mobile).
app.use(express.static(path.join(__dirname, 'public'), {
  etag: IS_PROD,
  lastModified: IS_PROD,
  setHeaders: (res, filePath) => {
    const noCache = !IS_PROD || /sw\.js$|index\.html$/.test(filePath);
    res.setHeader('Cache-Control', noCache ? 'no-store, max-age=0' : 'public, max-age=3600');
  }
}));

/* ------------------------------------------------------------------ */
/* Talking to Gemini                                                   */
/* ------------------------------------------------------------------ */

const keyLooksReal = () =>
  Boolean(API_KEY) && API_KEY !== 'paste_your_key_here' && API_KEY.length > 20;

/**
 * Sends `parts` (text, and optionally an image/audio blob) to Gemini
 * and returns the plain-text reply.
 *
 * NOTE ON GEMINI 3.x: temperature / topP / topK / candidateCount were REMOVED
 * and now cause errors. Reasoning depth is controlled by thinkingLevel instead:
 *   'low'    = fastest + cheapest  (we use this for chat and scans)
 *   'medium' = default
 *   'high'   = deepest reasoning
 * ('minimal' is NOT supported on 3.8 Flash and returns a validation error.)
 */
async function callGemini(parts, { systemInstruction, thinkingLevel = 'low' } = {}) {
  if (!keyLooksReal()) {
    const err = new Error(
      'No Gemini API key found. Copy .env.example to .env and paste your key into it, then restart the server.'
    );
    err.status = 503;
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: 1200,
      thinkingConfig: { thinkingLevel }
    }
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify(body)
    });
  } catch (networkError) {
    const err = new Error('Could not reach Google. Check your internet connection.');
    err.status = 502;
    throw err;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    let reason = data?.error?.message || `Gemini returned HTTP ${response.status}`;

    // Google retires models periodically. Make that failure obvious and fixable.
    if (/no longer available|not found|is not supported/i.test(reason)) {
      reason = `The model "${MODEL}" is no longer available. ` +
        `Open http://localhost:${PORT}/api/models to see what your key can use, ` +
        `then set GEMINI_MODEL in your .env file and restart. (Google said: ${reason})`;
    }
    // Gemini 3.x rejects old sampling knobs outright.
    if (/temperature|top_p|top_k|candidate_count/i.test(reason)) {
      reason = `Unsupported generation setting for this model — Gemini 3.x removed ` +
        `temperature/topP/topK/candidateCount. (Google said: ${reason})`;
    }

    const err = new Error(reason);
    // 429 = you have hit the free-tier rate limit. Wait a minute and retry.
    err.status = response.status === 429 ? 429 : 502;
    // "retryable" = worth trying the backup provider instead of giving up.
    err.retryable = response.status === 429 || response.status >= 500 ||
      /no longer available|not found|is not supported|quota|exhausted/i.test(reason);
    throw err;
  }

  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n').trim();

  if (!text) {
    const blocked = data?.promptFeedback?.blockReason || candidate?.finishReason;
    const err = new Error(
      blocked
        ? `Gemini declined to answer (${blocked}). Try a clearer or different photo.`
        : 'Gemini returned an empty response. Please try again.'
    );
    err.status = 422;
    // A safety refusal IS worth retrying elsewhere — other models tune safety differently.
    err.retryable = Boolean(blocked);
    throw err;
  }
  return text;
}

/* ------------------------------------------------------------------ */
/* Backup provider: OpenRouter                                         */
/* ------------------------------------------------------------------ */

const OR_KEY = process.env.OPENROUTER_API_KEY;
// NOTE: OpenRouter's ":free" line-up changes constantly — models lose free status
// without warning (this is what killed llama-4-scout:free). Run
// http://localhost:3000/api/models/free to see what is genuinely free RIGHT NOW.
// inkling:free is chosen because it accepts text + image + AUDIO, so it can even
// cover the Voice Coach when Gemini is down.
const OR_MODEL = process.env.OPENROUTER_MODEL || 'thinkingmachines/inkling:free';
const orConfigured = () => Boolean(OR_KEY) && OR_KEY !== 'paste_your_key_here' && OR_KEY.length > 20;

/**
 * Same job as callGemini, but speaks OpenRouter's OpenAI-style format.
 * Used automatically when Gemini is rate-limited, down, or has retired a model.
 */
async function callOpenRouter(parts, { systemInstruction } = {}) {
  if (!orConfigured()) {
    const err = new Error('OpenRouter fallback is not configured.');
    err.status = 503;
    throw err;
  }

  // Translate Gemini's "parts" into OpenRouter's "content" blocks.
  const content = [];
  for (const p of parts) {
    if (p.text) {
      content.push({ type: 'text', text: p.text });
    } else if (p.inline_data) {
      const { mime_type, data } = p.inline_data;
      if (mime_type.startsWith('image/')) {
        content.push({ type: 'image_url', image_url: { url: `data:${mime_type};base64,${data}` } });
      } else if (mime_type.startsWith('audio/')) {
        // Only works if OPENROUTER_MODEL accepts audio (the default, inkling:free, does).
        // Check with /api/models/free before switching models.
        content.push({
          type: 'input_audio',
          input_audio: { data, format: mime_type.includes('wav') ? 'wav' : 'webm' }
        });
      }
    }
  }

  const messages = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content });

  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OR_KEY}`,
      'HTTP-Referer': 'http://localhost:' + PORT,
      'X-Title': BRAND.NAME
    },
    body: JSON.stringify({ model: OR_MODEL, messages, max_tokens: 1200 })
  });

  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d?.error?.message || `OpenRouter returned HTTP ${r.status}`;

    // When a model loses free status, OpenRouter's error names the replacement slug.
    // We do NOT auto-use it — that one is PAID and would silently charge you.
    const suggested = /use this slug instead:\s*([\w./-]+)/i.exec(msg)?.[1];
    const err = new Error(
      suggested
        ? `The backup model "${OR_MODEL}" is no longer free. Open ` +
          `http://localhost:${PORT}/api/models/free to pick a currently-free one and set ` +
          `OPENROUTER_MODEL in .env. (OpenRouter suggested the PAID "${suggested}".)`
        : msg
    );
    err.status = r.status === 429 ? 429 : 502;
    throw err;
  }

  const text = d?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    const err = new Error('Backup model returned an empty response.');
    err.status = 422;
    throw err;
  }
  return text;
}

/**
 * THE FUNCTION THE ROUTES ACTUALLY CALL.
 * Tries Gemini first. If Gemini fails in a way worth retrying (rate limit,
 * outage, retired model, safety refusal), silently retries on OpenRouter.
 * If OpenRouter also fails, reports the ORIGINAL Gemini error — it's more useful.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function askAI(parts, opts = {}) {
  let geminiError;

  // "High demand" / 429 / 5xx from Google are usually over in a couple of seconds,
  // so retry twice with backoff BEFORE burning the backup provider's small free quota.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await callGemini(parts, opts);
      return { text, provider: 'gemini' };
    } catch (e) {
      geminiError = e;
      const transient = /high demand|overloaded|try again|unavailable|rate/i.test(e.message) ||
        e.status === 429;
      if (!transient || attempt === 2) break;
      const waitMs = [1500, 4000][attempt];
      console.warn(`[retry] Gemini busy, waiting ${waitMs}ms (attempt ${attempt + 2}/3)`);
      await sleep(waitMs);
    }
  }

  {
    if (!geminiError.retryable || !orConfigured()) throw geminiError;

    console.warn(`[fallback] Gemini failed (${geminiError.message}) → trying OpenRouter`);
    try {
      const text = await callOpenRouter(parts, opts);
      return { text, provider: 'openrouter' };
    } catch (orError) {
      console.warn(`[fallback] OpenRouter also failed: ${orError.message}`);
      if (orError.status === 503) throw orError; // e.g. audio unsupported
      throw geminiError;
    }
  }
}

/**
 * Gemini sometimes wraps JSON in ```json fences despite being told not to.
 * This digs the actual object out.
 */
function parseJsonReply(text) {
  let clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start !== -1 && end !== -1) clean = clean.slice(start, end + 1);
  try {
    return JSON.parse(clean);
  } catch {
    // Fall back to showing the raw text rather than failing outright.
    return { title: 'Coach feedback', summary: text, strengths: [], improvements: [], stats: [], xp: 10 };
  }
}

/* ------------------------------------------------------------------ */
/* API routes                                                          */
/* ------------------------------------------------------------------ */

// Tells the frontend which features exist + whether the key is configured.
app.get('/api/config', (req, res) => {
  res.json({
    brand: BRAND,
    keyConfigured: keyLooksReal(),
    model: MODEL,
    backupReady: orConfigured(),
    scanners: Object.entries(SCANNERS).map(([id, s]) => ({
      id,
      label: s.label,
      emoji: s.emoji,
      blurb: s.blurb,
      accept: s.accept
    }))
  });
});

// Diagnostic: which OpenRouter models are ACTUALLY free right now, and what they accept.
// OpenRouter's free list changes often — check here instead of trusting old tutorials.
app.get('/api/models/free', async (req, res) => {
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models');
    const d = await r.json();
    const free = (d.data || [])
      .filter((m) => m.id.endsWith(':free'))
      .map((m) => ({
        id: m.id,
        accepts: m.architecture?.input_modalities || [],
        context: m.context_length
      }));
    res.json({
      currentlyUsing: OR_MODEL,
      stillFree: free.some((m) => m.id === OR_MODEL),
      bestForThisApp: free
        .filter((m) => m.accepts.includes('image'))
        .sort((a, b) => (b.accepts.includes('audio') ? 1 : 0) - (a.accepts.includes('audio') ? 1 : 0))
        .slice(0, 8),
      allFree: free
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Diagnostic: pings BOTH providers so you can see which are actually working.
// Visit http://localhost:3000/api/health
app.get('/api/health', async (req, res) => {
  const ping = [{ text: 'Reply with the single word: ok' }];
  const out = {};
  try { await callGemini(ping); out.gemini = 'working ✅'; }
  catch (e) { out.gemini = `failing ❌ — ${e.message}`; }
  try { out.openrouter = orConfigured() ? (await callOpenRouter(ping), 'working ✅') : 'not configured'; }
  catch (e) { out.openrouter = `failing ❌ — ${e.message}`; }
  out.models = { gemini: MODEL, openrouter: OR_MODEL };
  res.json(out);
});

// Diagnostic: lists every model your key is allowed to call.
// Visit http://localhost:3000/api/models in your browser whenever a model breaks.
app.get('/api/models', async (req, res) => {
  if (!keyLooksReal()) return res.status(503).json({ error: 'No API key configured.' });
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': API_KEY }
    });
    const d = await r.json();
    const usable = (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace('models/', ''));
    res.json({ currentlyUsing: MODEL, usableModels: usable });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// --- Photo scanners: physique / food / posture / outfit -------------
app.post('/api/scan/:type', upload.single('image'), async (req, res) => {
  const scanner = SCANNERS[req.params.type];
  if (!scanner) return res.status(404).json({ error: 'Unknown scanner type.' });
  if (!req.file) return res.status(400).json({ error: 'No photo was received.' });

  try {
    const { text, provider } = await askAI(
      [
        { text: scanner.prompt },
        {
          inline_data: {
            mime_type: req.file.mimetype,
            data: req.file.buffer.toString('base64')
          }
        }
      ],
      { thinkingLevel: 'low' }
    );
    res.json({ ...parseJsonReply(text), provider });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// --- Chat with Coach ------------------------------------------------
app.post('/api/chat', async (req, res) => {
  const history = Array.isArray(req.body.messages) ? req.body.messages.slice(-12) : [];
  if (!history.length) return res.status(400).json({ error: 'No message sent.' });

  // Flatten the conversation into a single prompt (simple + reliable).
  const transcript = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
    .join('\n');

  try {
    const { text: reply, provider } = await askAI([{ text: `${transcript}\nCoach:` }], {
      systemInstruction: CHAT_SYSTEM,
      thinkingLevel: 'low'
    });
    res.json({ reply, provider });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// --- Voice Coach ----------------------------------------------------
app.get('/api/voice/prompt', (req, res) => {
  res.json({ prompt: VOICE_PROMPTS[Math.floor(Math.random() * VOICE_PROMPTS.length)] });
});

app.post('/api/voice', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio was received.' });
  const spoken = req.body.prompt || 'an open speaking prompt';

  try {
    const { text } = await askAI(
      [
        { text: `${VOICE_FEEDBACK_PROMPT}\n\nThe practice prompt they were answering was: "${spoken}"` },
        {
          inline_data: {
            mime_type: req.file.mimetype || 'audio/webm',
            data: req.file.buffer.toString('base64')
          }
        }
      ],
      { thinkingLevel: 'medium' }
    );
    res.json(parseJsonReply(text));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Friendly message when an upload is too big.
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'That file is too large. Please keep it under 12 MB.' });
  }
  res.status(500).json({ error: err?.message || 'Something went wrong.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ${BRAND.NAME} running:  http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL}`);
  console.log(
    keyLooksReal()
      ? '  Gemini key: loaded ✅'
      : '  Gemini key: MISSING ❌  -> copy .env.example to .env and paste your key'
  );
  console.log(
    orConfigured()
      ? `  Backup (OpenRouter): ready ✅  [${OR_MODEL}]\n`
      : '  Backup (OpenRouter): not configured — add OPENROUTER_API_KEY to .env\n'
  );
});
