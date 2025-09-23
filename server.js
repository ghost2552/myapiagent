// server.js (CommonJS - paste & deploy)
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { google } = require("googleapis");

const app = express();
const PORT = process.env.PORT || 10000;

// parse JSON
app.use(bodyParser.json());
app.use(cors());

// Vapi secret (header x-vapi-key)
const VAPI_SECRET = process.env.VAPI_SECRET || "change_this_secret";

// ---------- Google auth selection (safe) ----------
let authClient = null;

/**
 * Priority:
 * 1) Service account JWT using GOOGLE_CLIENT_EMAIL & GOOGLE_PRIVATE_KEY
 * 2) OAuth2 client using JSON creds in GOOGLE_CREDENTIALS and tokens in GOOGLE_TOKENS
 *
 * Note: GOOGLE_PRIVATE_KEY in Render should have newlines replaced with \n
 */
try {
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    // safe replace only when the env var exists
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      : null;

    if (!privateKey) throw new Error("GOOGLE_PRIVATE_KEY is empty after replace");

    authClient = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      privateKey,
      ["https://www.googleapis.com/auth/calendar"]
    );

    console.log("Using service account (JWT) auth for Google Calendar.");
  } else if (process.env.GOOGLE_CREDENTIALS && process.env.GOOGLE_TOKENS) {
    // If you used OAuth2 flow previously and stored credentials+tokens
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const tokens = JSON.parse(process.env.GOOGLE_TOKENS);

    const clientId = creds.installed?.client_id || creds.web?.client_id;
    const clientSecret = creds.installed?.client_secret || creds.web?.client_secret;
    const redirectUri = (creds.installed?.redirect_uris || creds.web?.redirect_uris || [])[0];

    if (!clientId || !clientSecret) throw new Error("Invalid GOOGLE_CREDENTIALS");

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials(tokens);
    authClient = oauth2Client;

    console.log("Using OAuth2 client auth for Google Calendar.");
  } else {
    console.warn("No Google auth configured: set GOOGLE_CLIENT_EMAIL+GOOGLE_PRIVATE_KEY or GOOGLE_CREDENTIALS+GOOGLE_TOKENS.");
  }
} catch (e) {
  console.error("Error initializing Google auth:", e.message || e);
  authClient = null;
}

// Create calendar API object (auth may be null — we'll check later)
const getCalendar = () => google.calendar({ version: "v3", auth: authClient });

// ---------- Root (sanity) ----------
app.get("/", (req, res) => {
  res.send("✅ Vapi → Google Calendar backend (POST /events)");
});

// ---------- /events endpoint ----------
app.post("/events", async (req, res) => {
  try {
    // Basic Vapi header check (optional but recommended)
    const key = req.headers["x-vapi-key"];
    if (VAPI_SECRET && key !== VAPI_SECRET) {
      console.warn("Invalid Vapi key:", key);
      return res.status(401).json({ error: "Unauthorized - invalid x-vapi-key" });
    }

    // Log incoming body to help debugging
    console.log("=== RAW VAPI REQUEST ===");
    console.log(JSON.stringify(req.body, null, 2));

    // Vapi sends parameters under `arguments` — also accept plain body (for manual testing)
    const args = (req.body && req.body.arguments) ? req.body.arguments : req.body;

    // Validate required fields
    if (!args || !args.summary || !args.start || !args.end) {
      console.warn("Missing required fields in args:", args);
      return res.status(400).json({ error: "Missing required fields: summary, start, end" });
    }

    // Ensure Google auth available
    if (!authClient) {
      console.error("Google auth client not configured.");
      return res.status(500).json({ error: "Server not configured with Google credentials" });
    }

    // Build event object
    const event = {
      summary: args.summary,
      description: args.description || "",
      location: args.location || "",
      start: { dateTime: args.start },
      end: { dateTime: args.end },
      attendees: (Array.isArray(args.attendees) ? args.attendees : []).map(email => ({ email })),
    };

    // Insert event
    const calendar = getCalendar();
    const insertResponse = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    console.log("Event inserted:", insertResponse.data.id);

    // Return Vapi expected format
    return res.json({
      results: [
        {
          toolCallId: req.body.toolCallId || "manual-test",
          result: {
            message: `Event created: ${insertResponse.data.summary || args.summary}`,
            eventId: insertResponse.data.id,
            htmlLink: insertResponse.data.htmlLink,
            raw: insertResponse.data
          }
        }
      ]
    });
  } catch (err) {
    // Show more useful error in logs and return sanitized error to client
    console.error("Error creating calendar event:", err.response?.data || err.message || err);
    const msg = err.response?.data?.error?.message || err.message || "Failed to create event";
    return res.status(500).json({ error: msg });
  }
});

// Start
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
