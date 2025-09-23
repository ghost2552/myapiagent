// server.js
const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");

const app = express();
const PORT = process.env.PORT || 10000;

// parse incoming json
app.use(bodyParser.json());

// ==================== GOOGLE AUTH ====================
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || "{}");
const tokens = JSON.parse(process.env.GOOGLE_TOKENS || "{}");

const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web || {};
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);

if (tokens.refresh_token) {
  oAuth2Client.setCredentials(tokens);
}

const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

// ==================== VAPI ENDPOINT ====================
app.post("/events", async (req, res) => {
  console.log("--- RAW VAPI REQUEST ---");
  console.log(JSON.stringify(req.body, null, 2));

  try {
    const args = req.body.arguments || {};

    if (!args.summary || !args.start || !args.end) {
      return res.status(400).json({ error: "Missing required fields: summary, start, end" });
    }

    const event = {
      summary: args.summary,
      description: args.description || "",
      location: args.location || "",
      start: { dateTime: args.start },
      end: { dateTime: args.end },
      attendees: (args.attendees || []).map((email) => ({ email })),
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    console.log("✅ Event created:", response.data);

    return res.json({
      results: [
        {
          toolCallId: req.body.toolCallId || "manual-test",
          result: `Event created: ${response.data.htmlLink}`,
        },
      ],
    });
  } catch (err) {
    console.error("❌ Error creating event:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
