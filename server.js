// server.js (CommonJS - paste into project root)
const express = require('express');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');

dotenv.config();

const app = express();
app.use(cors());

// Accept JSON bodies and also accept text/raw bodies so we can recover from weird content-types
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.text({ type: '*/*', limit: '1mb' }));

/**
 * Helper to safely get a parsed body no matter what Content-Type Vapi used
 */
function getParsedBody(req) {
  // 1) express.json parsed object available
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return req.body;
  }

  // 2) if express.urlencoded parsed into object
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return req.body;
  }

  // 3) if express.text captured raw payload (string), try to parse JSON
  if (typeof req.body === 'string' && req.body.trim().length > 0) {
    try {
      return JSON.parse(req.body);
    } catch (err) {
      // not JSON; fallback to raw string payload
      return { raw: req.body };
    }
  }

  // 4) final fallback
  return {};
}

/**
 * Load client credentials.
 * Priority:
 * 1) process.env.GOOGLE_CREDENTIALS (JSON string)
 * 2) file at /etc/secrets/client_secret.json (Render secret files)
 */
function loadCredentials() {
  if (process.env.GOOGLE_CREDENTIALS) {
    try {
      return JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } catch (err) {
      console.error('Failed to parse GOOGLE_CREDENTIALS JSON:', err);
      throw new Error('Invalid GOOGLE_CREDENTIALS JSON');
    }
  }

  const secretPath = process.env.GOOGLE_SECRET_PATH || '/etc/secrets/client_secret.json';
  if (fs.existsSync(secretPath)) {
    const raw = fs.readFileSync(secretPath, 'utf8');
    try {
      return JSON.parse(raw);
    } catch (err) {
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

// In-memory token store for quick testing (persist to DB or secret store in production)
let oauthTokens = null;
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const VAPI_KEY = process.env.VAPI_KEY || null;

app.get('/', (req, res) => {
  res.status(200).send('Calendar API proxy running. Use POST /events or GET /authorize to authorize.');
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
    res.send('Authorization successful. You can now use the API.');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('OAuth callback error: ' + String(err.message));
  }
});

/**
 * Robust POST /events
 * Accepts:
 * - Google Calendar format
 * - Vapi flat format inside { arguments: { summary, start, end, ... } }
 * - Raw JSON string bodies
 *
 * ALWAYS returns JSON so the caller (Vapi) receives a response.
 */
app.post('/events', async (req, res) => {
  // We'll make sure we ALWAYS send a JSON response, even on unexpected errors.
  try {
    // Optional header check: VAPI should send x-vapi-key header
    if (VAPI_KEY) {
      const key = req.header('x-vapi-key') || req.header('x-api-key');
      if (!key || key !== VAPI_KEY) {
        console.warn('Invalid or missing API key header');
        return res.status(401).json({ success: false, error: 'Invalid or missing API key' });
      }
    }

    // Parse body robustly
    const parsed = getParsedBody(req);
    console.log('--- RAW Request HEADERS ---');
    console.log(req.headers);
    console.log('--- PARSED BODY ---');
    console.log(JSON.stringify(parsed).slice(0, 10000)); // limit log size

    // If Vapi's wrapper: { arguments: { start, end, summary, ... } }
    let body = parsed;
    if (parsed && parsed.arguments && typeof parsed.arguments === 'object') {
      // copy arguments into top-level fields for easier handling
      body = Object.assign({}, parsed.arguments, { __vapi_raw: true });
    }

    // Normalize: allow Vapi's flat ISO datetimes (string) or Google style objects
    // If body.start is a string, convert to { dateTime: string }
    if (body.start && typeof body.start === 'string') {
      body.start = { dateTime: body.start };
    } else if (body.start && body.start.dateTime && typeof body.start.dateTime === 'string') {
      // ok
    }

    if (body.end && typeof body.end === 'string') {
      body.end = { dateTime: body.end };
    } else if (body.end && body.end.dateTime && typeof body.end.dateTime === 'string') {
      // ok
    }

    // Basic validation
    if (!body.summary || !body.start || !body.end) {
      console.warn('Validation failed - missing required fields');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: summary, start, end. Example: { summary, start: \"2025-09-23T10:00:00Z\", end: \"2025-09-23T11:00:00Z\" }'
      });
    }

    if (!body.start.dateTime || !body.end.dateTime) {
      return res.status(400).json({
        success: false,
        error: 'start.dateTime and end.dateTime are required (ISO8601).'
      });
    }

    // Ensure we have OAuth tokens
    if (!oauthTokens && process.env.GOOGLE_TOKENS) {
      try {
        oauthTokens = JSON.parse(process.env.GOOGLE_TOKENS);
        console.log('Loaded tokens from env GOOGLE_TOKENS.');
      } catch (err) {
        console.warn('Failed to parse GOOGLE_TOKENS:', err);
      }
    }

    if (!oauthTokens) {
      // Tell the caller to authorize — but still return JSON (so Vapi sees the response)
      console.warn('No oauth tokens available.');
      return res.status(400).json({
        success: false,
        error: 'No refresh token found. Re-authorize the app (GET /authorize).'
      });
    }

    // Create OAuth client and set credentials
    const oAuth2Client = createOAuthClient();
    oAuth2Client.setCredentials(oauthTokens);

    // Try to refresh/access token but don't fail hard if refresh warning occurs
    try {
      await oAuth2Client.getAccessToken();
    } catch (err) {
      console.warn('Warning: failed to refresh access token (continuing):', err && err.message);
    }

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    // Normalize attendees: allow ["a@x.com"] or [{email:"a@x.com"}]
    let attendees = body.attendees || [];
    if (Array.isArray(attendees) && typeof attendees[0] === 'string') {
      attendees = attendees.map((e) => ({ email: e }));
    }

    const event = {
      summary: body.summary,
      location: body.location,
      description: body.description,
      start: { dateTime: body.start.dateTime, timeZone: body.start.timeZone || undefined },
      end: { dateTime: body.end.dateTime, timeZone: body.end.timeZone || undefined },
      attendees,
    };

    // Insert the event and return the Google event resource to the caller
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: 'all',
    });

    console.log('Created event id=', response.data && response.data.id);

    // Always respond JSON (this is the crucial part so Vapi shows the tool response)
    return res.status(200).json({
      success: true,
      message: 'Event created',
      eventId: response.data && response.data.id,
      event: response.data
    });
  } catch (err) {
    console.error('Error creating event:', err && err.stack ? err.stack : err);
    // Always return JSON on errors so Vapi receives a response
    return res.status(500).json({
      success: false,
      error: 'Error creating event',
      detail: err && err.message ? err.message : String(err)
    });
  }
});

// Bind to 0.0.0.0 and use the platform PORT
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
