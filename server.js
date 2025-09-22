// server.js (CommonJS - paste into project root)
const express = require('express');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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
  // support both "web" and "installed" formats
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

// Protect /events with an API key header (recommended for VAPI)
const VAPI_KEY = process.env.VAPI_KEY || null;

app.get('/', (req, res) => {
  res.status(200).send('Calendar API proxy running. Use POST /events or GET /authorize to authorize.');
});

// Route to start authorization (opens Google consent screen)
app.get('/authorize', (req, res) => {
  try {
    const oAuth2Client = createOAuthClient();
    const url = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
    });
    // redirect user to Google
    res.redirect(url);
  } catch (err) {
    console.error('Authorize error:', err);
    res.status(500).send('Authorize error: ' + String(err.message));
  }
});

// OAuth2 callback - Google redirects here after user consents
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
 * POST /events
 * Body expected:
 * {
 *   "summary": "Title",
 *   "description": "Details",
 *   "location": "Zoom / Online",
 *   "start": { "dateTime": "2025-09-22T10:00:00Z" },
 *   "end":   { "dateTime": "2025-09-22T11:00:00Z" },
 *   "attendees": [ {"email":"x@y.com"} ]  OR ["x@y.com"]
 * }
 */
app.post('/events', async (req, res) => {
  try {
    // Optional header check: VAPI should send x-vapi-key header
    if (VAPI_KEY) {
      const key = req.header('x-vapi-key') || req.header('x-api-key');
      if (!key || key !== VAPI_KEY) {
        return res.status(401).json({ error: 'Invalid or missing API key' });
      }
    }

    // validate body
    const body = req.body || {};
    console.log('Incoming event:', JSON.stringify(body));

    if (!body.summary || !body.start || !body.end) {
      return res.status(400).json({ error: 'Missing required fields: summary, start, end' });
    }
    if (!body.start.dateTime || !body.end.dateTime) {
      return res.status(400).json({ error: 'start.dateTime and end.dateTime are required (ISO8601)' });
    }

    // ensure we have credentials (tokens)
    if (!oauthTokens) {
      // attempt to load tokens from env (if you stored a refresh token there)
      if (process.env.GOOGLE_TOKENS) {
        try {
          oauthTokens = JSON.parse(process.env.GOOGLE_TOKENS);
          console.log('Loaded tokens from env GOOGLE_TOKENS.');
        } catch (err) {
          console.warn('Failed to parse GOOGLE_TOKENS:', err);
        }
      }
    }

    // If still no tokens -> cannot create event
    if (!oauthTokens) {
      return res.status(400).json({ error: 'No refresh token found. Re-authorize the app (GET /authorize).' });
    }

    const oAuth2Client = createOAuthClient();
    oAuth2Client.setCredentials(oauthTokens);

    // If refresh token present, try to refresh access token automatically
    try {
      await oAuth2Client.getAccessToken(); // triggers refresh if needed
    } catch (err) {
      console.warn('Error refreshing access token (continuing, may still work):', err.message);
    }

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    // normalize attendees: allow ["a@x.com"] or [{email:"a@x.com"}]
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

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: 'all', // optional: 'none'|'externalOnly'|'all'
    });

    console.log('Created event id=', response.data && response.data.id);
    return res.status(200).json(response.data);
  } catch (err) {
    console.error('Error creating event:', err && err.message ? err.message : err);
    // expose some helpful info but don't leak secrets
    res.status(500).json({ error: 'Error creating event', detail: err && err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
