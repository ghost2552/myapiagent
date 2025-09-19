// calendar.js
// Full working webhook router for Google Calendar event creation
// - Place your client secret JSON in the project root with the filename below (default).
// - If you don't have a token.json it will return an authUrl. POST the code to /oauth2callback to save the token.
//
// Default filenames:
//   client secret: client_secret_703184561095-rhjck2ccik10fo0vns0he6a9c8c3a526.apps.googleusercontent.com.json
//   token file: token.json
//
// Environment variables (optional):
//   CLIENT_SECRET_FILE - path to client secret JSON
//   TOKEN_PATH - path to token file
//   VAPI_KEY - expected x-vapi-key header (default: change_this_secret)
//
const fs = require('fs');
const path = require('path');
const express = require('express');
const { google } = require('googleapis');

const router = express.Router();

// Config / defaults
const CLIENT_SECRET_FILE = process.env.CLIENT_SECRET_FILE || 'client_secret_703184561095-rhjck2ccik10fo0vns0he6a9c8c3a526.apps.googleusercontent.com.json';
const TOKEN_PATH = process.env.TOKEN_PATH || 'token.json';
const VAPI_KEY = process.env.VAPI_KEY || 'change_this_secret';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Load OAuth2 client from client secret file. Accepts both "installed" and "web" shapes.
 * Throws if client secret file missing or invalid.
 */
function loadOAuthClient() {
  const secretPath = path.resolve(process.cwd(), CLIENT_SECRET_FILE);
  if (!fs.existsSync(secretPath)) {
    const err = new Error(`Client secret file not found: ${secretPath}`);
    err.code = 'NO_CLIENT_SECRET';
    throw err;
  }

  const content = fs.readFileSync(secretPath, 'utf8');
  let credentials;
  try {
    credentials = JSON.parse(content);
  } catch (e) {
    const err = new Error('Invalid JSON in client secret file');
    err.original = e;
    throw err;
  }

  // support both desktop (installed) and web client formats
  const key = credentials.installed || credentials.web;
  if (!key) {
    const err = new Error('client secret JSON must contain "installed" or "web" object');
    throw err;
  }

  const clientId = key.client_id;
  const clientSecret = key.client_secret;
  const redirectUris = key.redirect_uris || key.redirectUri || [];
  const redirectUri = redirectUris[0] || 'urn:ietf:wg:oauth:2.0:oob';

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // load token if exists
  const tokenFullPath = path.resolve(process.cwd(), TOKEN_PATH);
  if (fs.existsSync(tokenFullPath)) {
    try {
      const token = JSON.parse(fs.readFileSync(tokenFullPath, 'utf8'));
      oAuth2Client.setCredentials(token);
    } catch (e) {
      console.warn('Warning: unable to read token.json (invalid JSON?). Will require re-authorization.');
    }
  }

  return oAuth2Client;
}

/**
 * Save token to disk (sync). Overwrites token path.
 */
function saveToken(token) {
  const tokenFullPath = path.resolve(process.cwd(), TOKEN_PATH);
  fs.writeFileSync(tokenFullPath, JSON.stringify(token, null, 2), 'utf8');
  console.log(`Saved token to ${tokenFullPath}`);
}

/**
 * Create a calendar event using googleapis
 * - auth: OAuth2 client (must be authorized)
 * - event: { summary, start_time, end_time, timezone, attendees[], location, description }
 * Returns a Promise that resolves to the created event object.
 */
function createCalendarEvent(auth, event) {
  const calendar = google.calendar({ version: 'v3', auth });

  const resource = {
    summary: event.summary || 'No title',
    location: event.location || undefined,
    description: event.description || undefined,
    start: {
      dateTime: event.start_time,
      timeZone: event.timezone || 'UTC',
    },
    end: {
      dateTime: event.end_time,
      timeZone: event.timezone || 'UTC',
    },
    attendees: Array.isArray(event.attendees) ? event.attendees.map((e) => ({ email: e })) : [],
    // You can add reminders or other fields here if needed
  };

  return new Promise((resolve, reject) => {
    calendar.events.insert(
      {
        calendarId: 'primary',
        resource,
      },
      (err, res) => {
        if (err) return reject(err);
        resolve(res.data);
      }
    );
  });
}

/**
 * Middleware: check x-vapi-key header
 */
function checkVapiKey(req, res, next) {
  const key = req.header('x-vapi-key') || req.header('X-Vapi-Key') || req.query.vapi_key;
  if (!key || key !== VAPI_KEY) {
    return res.status(401).json({
      ok: false,
      message: 'Invalid or missing x-vapi-key header',
    });
  }
  next();
}

// POST /oauth2callback  -> exchange code for token (body: { code: '...' })
router.post('/oauth2callback', express.json(), async (req, res) => {
  try {
    const code = req.body && req.body.code;
    if (!code) return res.status(400).json({ ok: false, message: 'Missing code in body' });

    const oAuth2Client = loadOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code);
    saveToken(tokens);
    oAuth2Client.setCredentials(tokens);
    return res.json({ ok: true, message: 'Token saved', tokens: { ...tokens, access_token: Boolean(tokens.access_token) ? '***set***' : undefined } });
  } catch (err) {
    console.error('Error in /oauth2callback', err);
    return res.status(500).json({ ok: false, message: 'Error exchanging code', error: err.message || String(err) });
  }
});

// Accept POST both at / and /events for compatibility
router.post('/', express.json(), checkVapiKey, async (req, res) => {
  return handleCreateEvent(req, res);
});
router.post('/events', express.json(), checkVapiKey, async (req, res) => {
  return handleCreateEvent(req, res);
});

/**
 * Core handler used by both endpoints
 */
async function handleCreateEvent(req, res) {
  try {
    const body = req.body || {};
    // Basic parameter validation
    if (!body.summary || !body.start_time || !body.end_time) {
      return res.status(400).json({
        ok: false,
        message: 'Missing required fields. Required: summary, start_time, end_time. Optional: attendees (array), timezone',
        received: { summary: !!body.summary, start_time: !!body.start_time, end_time: !!body.end_time },
      });
    }

    // Load OAuth2 client
    let oAuth2Client;
    try {
      oAuth2Client = loadOAuthClient();
    } catch (e) {
      console.error('Client secret load error', e);
      return res.status(500).json({ ok: false, message: 'Server misconfiguration: client secret file missing or invalid', error: e.message });
    }

    // If no credentials set (no token) -> return authUrl so you can authorize
    if (!oAuth2Client.credentials || !oAuth2Client.credentials.access_token) {
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
      });
      console.log('Authorization required. Provide user with URL:', authUrl);
      return res.status(400).json({
        ok: false,
        message: 'Authorization required. Use the provided authUrl to get a code, then POST { code } to /webhook/v1/oauth2callback',
        authUrl,
      });
    }

    // Create the event
    let created;
    try {
      created = await createCalendarEvent(oAuth2Client, {
        summary: body.summary,
        location: body.location,
        description: body.description,
        start_time: body.start_time,
        end_time: body.end_time,
        timezone: body.timezone,
        attendees: body.attendees,
      });
    } catch (err) {
      console.error('Error creating event:', err);
      // Provide more useful JSON error back to caller
      return res.status(500).json({
        ok: false,
        message: 'Error creating event',
        error: err.message || String(err),
      });
    }

    // Success
    return res.json({
      ok: true,
      message: `Event '${created.summary || body.summary}' created successfully!`,
      link: created.htmlLink,
      data: created,
    });
  } catch (err) {
    console.error('Unhandled error in webhook handler', err);
    return res.status(500).json({ ok: false, message: 'Internal server error', error: err.message || String(err) });
  }
}

// Basic health endpoint for quick checks
router.get('/health', (req, res) => {
  res.json({ ok: true, message: 'calendar webhook ready' });
});

module.exports = router;
