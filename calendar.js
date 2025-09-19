// calendar.js
const express = require("express");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// Path to your credentials file (keep this filename!)
const CREDENTIALS_PATH = path.join(
  __dirname,
  "client_secret_703184561095-rhjck2ccik10fo0vns0he6a9c8c3a526.apps.googleusercontent.com.json"
);

// Load client credentials
function loadClient() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);

  // Use "installed" or "web" depending on JSON structure
  const clientConfig = credentials.installed || credentials.web;

  if (!clientConfig) {
    throw new Error("❌ Could not find 'installed' or 'web' in client_secret.json");
  }

  const { client_secret, client_id, redirect_uris } = clientConfig;

  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

// Google Calendar API
const calendar = google.calendar({ version: "v3" });

// Route: create event
router.post("/", async (req, res) => {
  try {
    const oAuth2Client = loadClient();

    // TODO: load your saved tokens here if you have them
    // For now, assuming token.json exists
    const TOKEN_PATH = path.join(__dirname, "token.json");
    if (fs.existsSync(TOKEN_PATH)) {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
      oAuth2Client.setCredentials(token);
    } else {
      return res.status(400).json({
        ok: false,
        message: "❌ No token.json found. Please authorize the app first."
      });
    }

    const { summary, location, description, start_time, end_time, attendees } =
      req.body;

    const event = {
      summary,
      location,
      description,
      start: {
        dateTime: start_time,
        timeZone: "UTC",
      },
      end: {
        dateTime: end_time,
        timeZone: "UTC",
      },
      attendees: attendees.map((email) => ({ email })),
    };

    const response = await calendar.events.insert({
      auth: oAuth2Client,
      calendarId: "primary",
      resource: event,
    });

    res.json({
      ok: true,
      message: `✅ Event '${response.data.summary}' created successfully!`,
      eventLink: response.data.htmlLink,
    });
  } catch (error) {
    console.error("❌ Error creating event:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
