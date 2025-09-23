// server.js (CommonJS)
// Run with: node server.js
// Set env vars on Render: GOOGLE_CREDENTIALS, REDIRECT_URI, VAPI_KEY (optional), GOOGLE_CALENDAR_ID (optional), TOKENS_FILE (optional), GOOGLE_TOKENS (optional)

const express = require('express');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

dotenv.config();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(cors());

// Accept JSON / form / text; allow larger payloads
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.text({ type: '*/*', limit: '5mb' }));

// Timing + tiny request logger (super helpful on Render)
app.use((req, _res, next) => {
  req._t0 = Date.now();
  console.log(`> ${req.method} ${req.url} ip=${req.ip} ua=${req.get('user-agent') || ''}`);
  next();
});

// Health + ping for connectivity checks
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, time: new Date().toISOString() }));
app.post('/events/ping', (req, res) => {
  console.log('Vapi reached /events/ping; x-vapi-key =', req.get('x-vapi-key'));
  res.status(200).json({ ok: true });
});

/** Parse body safely even if Content-Type is weird */
function getParsedBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && Object.keys(b).length > 0) return b;
  if (typeof b === 'string' && b.trim().length > 0) {
    try { return JSON.parse(b); } catch { return { raw: b }; }
  }
  return {};
}

/** Load OAuth client credentials:
 * 1) GOOGLE_CREDENTIALS (env JSON string)
 * 2) GOOGLE_SECRET_PATH or /etc/secrets/client_secret.json (Render Secret Files)
 */
function loadCredentials() {
  if (process.env.GOOGLE_CREDENTIALS) {
    try { return JSON.parse(process.env.GOOGLE_CREDENTIALS); }
    catch (err) {
      console.error('Failed to parse GOOGLE_CREDENTIALS:', err);
      throw new Error('Invalid GOOGLE_CREDENTIALS JSON');
    }
  }
  const secretPath = process.env.GOOGLE_SECRET_PATH || '/etc/secrets/client_secret.json';
  if (fs.existsSync(secretPath)) {
    try { return JSON.parse(fs.readFileSync(secretPath, 'utf8')); }
    catch (err) {
      console.error('Failed to parse secret file JSON:', err);
      throw new Error('Invalid client secret file JSON');
    }
  }
  throw new Error('GOOGLE_CREDENTIALS not set and secret file not found');
}

function createOAuthClient() {
  const credentials = loadCredentials();
  const cfg = credentials.web || credentials.installed || credentials;
  const client_id = cfg.client_id;
  const client_secret = cfg.client_secret;
  const redirect_uri = (cfg.redirect_uris && cfg.redirect_uris[0]) || process.env.REDIRECT_URI;
  if (!client_id || !client_secret || !redirect_uri) {
    throw new Error('Client ID/secret/redirect URI missing in credentials');
  }
  return new google.auth.OAuth2(client_id, client_secret, redirect_uri);
}

// Tokens: in-memory + env + optional file
let oauthTokens = null;
const TOKENS_FILE = process.env.TOKENS_FILE || ''; // e.g. '/etc/secrets/google_tokens.json'
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const VAPI_KEY = process.env.VAPI_KEY || null;
const DEFAULT_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

function loadTokensIfPresent() {
  if (!oauthTokens && process.env.GOOGLE_TOKENS) {
    try {
      oauthTokens = JSON.parse(process.env.GOOGLE_TOKENS);
      console.log('Loaded tokens from env GOOGLE_TOKENS.');
    } catch (err) {
      console.warn('Failed to parse env GOOGLE_TOKENS:', err.message);
    }
  }
  if (!oauthTokens && TOKENS_FILE && fs.existsSync(TOKENS_FILE)) {
    try {
      oauthTokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
      console.log('Loaded tokens from TOKENS_FILE:', TOKENS_FILE);
    } catch (err) {
      console.warn('Failed to parse TOKENS_FILE:', err.message);
    }
  }
}

function persistTokensIfPossible(tokens) {
  if (!TOKENS_FILE) {
    console.log('TOKENS_FILE not set; tokens only in memory (and possibly GOOGLE_TOKENS env).');
    return;
  }
  try {
    fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
    console.log('Persisted tokens to', TOKENS_FILE);
  } catch (err) {
    console.warn('Could not persist tokens to file:', err.message);
  }
}

app.get('/', (_req, res) => {
  res.status(200).send('Calendar API proxy running. GET /authorize to authorize. POST /events to create events.');
});

app.get('/authorize', (req, res) => {
  try {
    const oAuth2Client = createOAuthClient();
    const url = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
    });
    res.redirect(url);
  } catch (err) {
    console.error('Authorize error:', err);
    res.status(500).send('Authorize error: ' + String(err.message));
  }
});

app.get('/oauth2callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send('Missing code param');
    const oAuth2Client = createOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code);
    oauthTokens = tokens;
    oAuth2Client.setCredentials(tokens);
    console.log('Obtained tokens:', Object.keys(tokens));
    persistTokensIfPossible(tokens);
    res.send('Authorization successful. Tokens saved. You can now POST /events.');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('OAuth callback error: ' + String(err.message));
  }
});

function isIsoish(s) {
  if (typeof s !== 'string') return false;
  const n = Date.parse(s);
  return !isNaN(n);
}

// POST /events — tolerant to Vapi payload shapes
app.post('/events', async (req, res) => {
  try {
    // Optional API key gate
    if (VAPI_KEY) {
      const key = req.get('x-vapi-key') || req.get('x-api-key');
      if (!key || key !== VAPI_KEY) {
        console.warn('401 due to API key mismatch; got:', key);
        return res.status(401).json({ success: false, error: 'Invalid or missing API key' });
      }
    }

    const parsed = getParsedBody(req);
    console.log('--- HEADERS ---', JSON.stringify(req.headers));
    console.log('--- BODY ---', JSON.stringify(parsed).slice(0, 2000));

    // Vapi wrapper: { arguments: {...} }
    let body = parsed && parsed.arguments && typeof parsed.arguments === 'object'
      ? { ...parsed.arguments, __vapi_raw: true }
      : parsed;

    // Normalize datetimes
    if (typeof body?.start === 'string') body.start = { dateTime: body.start };
    if (typeof body?.end   === 'string') body.end   = { dateTime: body.end   };

    // Basic validation
    if (!body?.summary || !body?.start || !body?.end) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: summary, start, end',
        hint: 'Example: { summary, start: "2025-09-23T10:00:00+03:00", end: "2025-09-23T10:30:00+03:00" }'
      });
    }
    if (!body.start.dateTime || !body.end.dateTime) {
      return res.status(400).json({
        success: false,
        error: 'start.dateTime and end.dateTime are required (ISO8601)',
        got: { start: body.start, end: body.end }
      });
    }
    if (!isIsoish(body.start.dateTime) || !isIsoish(body.end.dateTime)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid datetime format; must be ISO8601 with timezone, e.g. 2025-09-23T10:00:00+03:00'
      });
    }
    if (Date.parse(body.end.dateTime) <= Date.parse(body.start.dateTime)) {
      return res.status(400).json({ success: false, error: 'end must be after start' });
    }

    // Ensure tokens are available
    loadTokensIfPresent();
    if (!oauthTokens) {
      return res.status(400).json({
        success: false,
        error: 'No refresh token found. Visit /authorize to grant access.',
        hint: 'After authorizing once, set GOOGLE_TOKENS env or TOKENS_FILE to persist across restarts.'
      });
    }

    // Init Google client
    const oAuth2Client = createOAuthClient();
    oAuth2Client.setCredentials(oauthTokens);
    try { await oAuth2Client.getAccessToken(); } catch (e) {
      console.warn('Access token refresh warning:', e?.message);
    }

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    // Normalize attendees
    let attendees = Array.isArray(body.attendees) ? body.attendees : [];
    if (attendees.length && typeof attendees[0] === 'string') {
      attendees = attendees.map(e => ({ email: e }));
    }

    // Idempotency (prevent duplicates on retries)
    const idemKey = crypto.createHash('sha256')
      .update(JSON.stringify({
        summary: body.summary,
        start: body.start.dateTime,
        end: body.end.dateTime,
        attendees
      }))
      .digest('hex');
    globalThis._seenCalls = globalThis._seenCalls || new Set();
    if (globalThis._seenCalls.has(idemKey)) {
      console.log('Duplicate tool call ignored via idempotency key');
      return res.status(200).json({
        success: true,
        message: `Duplicate call ignored. Event was already handled.`
      });
    }
    globalThis._seenCalls.add(idemKey);

    // Choose calendar (per-request, env default, or primary)
    const calendarId = body.calendarId || DEFAULT_CALENDAR_ID || 'primary';

    const event = {
      summary: body.summary,
      location: body.location,
      description: body.description,
      start: { dateTime: body.start.dateTime, timeZone: body.start.timeZone || undefined },
      end:   { dateTime: body.end.dateTime,   timeZone: body.end.timeZone   || undefined },
      attendees,
    };

    // Fast insert (sendUpdates:'none' while testing to reduce latency)
    const response = await calendar.events.insert({
      calendarId,
      resource: event,
      sendUpdates: 'none', // change to 'all' later if you want email invites
    });

    const ms = Date.now() - req._t0;
    console.log('Created event id=', response.data?.id, 'calendarId=', calendarId, 'in', ms, 'ms');

    return res.status(200).json({
      success: true,
      message: `Event created: ${body.summary} ${body.start.dateTime}–${body.end.dateTime}`,
      eventId: response.data?.id,
      event: response.data
    });
  } catch (err) {
    console.error('Error creating event:', err && err.stack ? err.stack : err);
    return res.status(500).json({
      success: false,
      error: 'Error creating event',
      detail: err?.message || String(err)
    });
  }
});

// Bind to 0.0.0.0 and use platform PORT (Render)
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

