// calendar.js
// Full working webhook + Google Calendar event creator
// Drop this file into the same folder that contains your client_secret_*.json and token.json (if you have one).

const express = require("express");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// Config
const VAPI_SHARED_SECRET = process.env.VAPI_SHARED_SECRET || "change_this_secret";
const TOKEN_PATH = path.join(__dirname, "token.json");

// Google OAuth scope for Calendar
const SCOPES = ["https://www.googleapis.com/auth/calendar"];

/**
 * Find the client secret file in the project folder.
 * It will prefer explicitly-named client_secret_*.json if present,
 * otherwise checks common filenames.
 */
function findClientSecretFile() {
  const dirFiles = fs.readdirSync(__dirname);
  // prefer any file that starts with client_secret_ and ends with .json
  const match = dirFiles.find((f) => /^client_secret_.*\.json$/i.test(f));
  if (match) return path.join(__dirname, match);

  // fallback candidates
  const candidates = [
    path.join(__dirname, "client_secret.json"),
    path.join(__dirname, "credentials.json"),
    path.join(__dirname, "client_secret_703184561095-rhjck2ccik10fo0vns0he6a9c8c3a526.apps.googleusercontent.com.json"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Create OAuth2 client from local client secret file.
 * Throws helpful error if not found or malformed.
 */
function createOAuthClient() {
  const credFile = findClientSecretFile();
  if (!credFile) {
    throw new Error(
      "No Google client secret file found. Place your client_secret_*.json (the file you uploaded) in the project folder."
    );
  }

  const raw = fs.readFileSync(credFile, "utf8");
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (err) {
    throw new Error("Failed to parse client secret JSON: " + err.message);
  }

  // credentials might be under "installed" (desktop) or "web" (web app)
  const clientConfig = credentials.installed || credentials.web;
  if (!clientConfig) {
    throw new Error("Invalid client secret file: missing 'installed' or 'web' section.");
  }

  const { client_id, client_secret, redirect_uris } = clientConfig;
  const redirectUri = Array.isArray(redirect_uris) && redirect_uris.length ? redirect_uris[0] : "urn:ietf:wg:oauth:2.0:oob";
  return new google.auth.OAuth2(client_id, client_secret, redirectUri);
}

/**
 * Load or request token. If token.json exists, apply credentials.
 * If missing, return the authorization URL (so caller can prompt user).
 */
function ensureAuth(oAuth2Client) {
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    oAuth2Client.setCredentials(token);
    return { ready: true };
  } else {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
    });
    return { ready: false, authUrl };
  }
}

/**
 * Save token returned after exchange code => token
 */
function saveToken(token) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2), "utf8");
  console.log("✅ Token stored to", TOKEN_PATH);
}

/**
 * Helper: extract event parameters from incoming webhook shape.
 * Supports:
 *  - direct body with summary/start_time/end_time/attendees
 *  - vapi/webhook function call payloads (toolCalls, function.arguments, etc)
 */
function extractEventFromRequest(req) {
  // direct
  const directFields = ["summary", "start_time", "end_time", "attendees", "description", "location", "timezone"];
  const hasDirect = directFields.some((k) => typeof req.body[k] !== "undefined");
  if (hasDirect) {
    return {
      summary: req.body.summary || "New Event",
      description: req.body.description || "",
      location: req.body.location || "",
      start_time: req.body.start_time,
      end_time: req.body.end_time,
      attendees: Array.isArray(req.body.attendees) ? req.body.attendees : [],
      timezone: req.body.timezone || process.env.TIMEZONE || "UTC",
    };
  }

  // vapi / function call shape - look inside body.message/toolCalls or body.toolCall
  // Various VAPI payload forms exist; be defensive
  function parseArguments(obj) {
    if (!obj) return null;
    if (obj.function && obj.function.arguments) return obj.function.arguments;
    if (obj.arguments) return obj.arguments;
    if (obj.parameters) return obj.parameters;
    return null;
  }

  // try top-level toolCall / toolCalls
  let args = null;
  if (req.body.toolCall) args = parseArguments(req.body.toolCall);
  if (!args && req.body.toolCalls && Array.isArray(req.body.toolCalls) && req.body.toolCalls.length) {
    args = parseArguments(req.body.toolCalls[0]);
  }
  if (!args && req.body.message && req.body.message.toolCalls && req.body.message.toolCalls.length) {
    args = parseArguments(req.body.message.toolCalls[0]);
  }
  if (!args && req.body.message && req.body.message.toolCall) {
    args = parseArguments(req.body.message.toolCall);
  }

  if (args) {
    // arguments might be a JSON-string (rare) or an object
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch (e) {
        // leave as string
      }
    }
    const summary = args.summary || args.title || "New Event";
    const attendees = args.attendees || args["attendees "] || [];
    return {
      summary,
      description: args.description || "",
      location: args.location || "",
      start_time: args.start_time || args.start || args.startTime,
      end_time: args.end_time || args.end || args.endTime,
      attendees: Array.isArray(attendees) ? attendees : [],
      timezone: args.timezone || args["Timezone "] || process.env.TIMEZONE || "UTC",
    };
  }

  // fallback: nothing parsed
  return null;
}

/**
 * Main POST route: create calendar event
 * - Validates X-VAPI-KEY header
 * - Extracts event info
 * - Ensures OAuth credentials (returns authUrl if not authorized)
 * - Inserts event into primary calendar
 */
router.post("/", async (req, res) => {
  try {
    // Header check
    const providedKey = req.get("x-vapi-key") || req.get("X-VAPI-KEY") || "";
    if (providedKey !== VAPI_SHARED_SECRET) {
      console.warn("Unauthorized webhook call (invalid x-vapi-key)");
      return res.status(401).json({ ok: false, message: "Unauthorized: invalid x-vapi-key" });
    }

    // Parse event from request
    const eventInput = extractEventFromRequest(req);
    if (!eventInput || !eventInput.start_time || !eventInput.end_time) {
      return res.status(400).json({
        ok: false,
        message:
          "Invalid request: missing event details. Provide summary, start_time, end_time, attendees OR send the VAPI function call payload.",
      });
    }

    // Setup OAuth client
    const oAuth2Client = createOAuthClient();
    const authCheck = ensureAuth(oAuth2Client);
    if (!authCheck.ready) {
      // not authorized yet - return auth URL in response to let you authorize
      return res.status(400).json({
        ok: false,
        message:
          "No token.json found. Authorize the app by visiting the URL and then paste the returned code to /oauth2callback (or open the URL in a browser).",
        authUrl: authCheck.authUrl,
      });
    }

    // Build event resource
    const timezone = eventInput.timezone || process.env.TIMEZONE || "UTC";
    const eventResource = {
      summary: eventInput.summary,
      description: eventInput.description || "",
      location: eventInput.location || "",
      start: { dateTime: eventInput.start_time, timeZone: timezone },
      end: { dateTime: eventInput.end_time, timeZone: timezone },
      attendees: (eventInput.attendees || []).map((em) => ({ email: em })),
    };

    // Insert event
    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: eventResource,
      sendUpdates: "all", // notify attendees if you want
    });

    console.log("Event created:", response.data && response.data.htmlLink);
    return res.json({
      ok: true,
      message: `Event '${response.data.summary}' created`,
      link: response.data.htmlLink,
      data: response.data,
    });
  } catch (err) {
    console.error("Error in / webhook:", err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, message: err.message || String(err) });
  }
});

/**
 * OAuth callback route:
 * Visit the authUrl shown earlier, copy the code param, and open:
 *  https://your-host/webhook/v1/oauth2callback?code=THE_CODE_HERE
 * The route will exchange the code for tokens and store token.json.
 *
 * Many deployments (like Render) require you to set the redirect URI in the Google console
 * to https://your-render-domain/webhook/v1/oauth2callback or to use 'urn:ietf:wg:oauth:2.0:oob'.
 */
router.get("/oauth2callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) {
      return res.status(400).send(
        "<p>Missing code query parameter. Example:</p>" +
          "<pre>/webhook/v1/oauth2callback?code=4/....</pre>"
      );
    }

    const oAuth2Client = createOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    saveToken(tokens);

    res.send(
      "<p>Token saved to server. You can now close this page and re-run the webhook request. ✅</p>"
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send(`<pre>OAuth error:\n${err.message || err}</pre>`);
  }
});

module.exports = router;
