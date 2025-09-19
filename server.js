const express = require("express");
const { google } = require("googleapis");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Load credentials from environment variable instead of file
if (!process.env.GOOGLE_CREDENTIALS) {
  console.error("❌ GOOGLE_CREDENTIALS env variable not set.");
  process.exit(1);
}
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

// In-memory token storage (you can persist to DB or file if needed)
let token = null;

// Step 1: Start OAuth flow
app.get("/authorize", (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
  });
  res.redirect(authUrl);
});

// Step 2: Callback from Google OAuth
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("No code found in callback.");
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    token = tokens;
    res.send("✅ Authorization successful! You can now create events.");
  } catch (err) {
    console.error("Error retrieving access token", err);
    res.status(500).send("Failed to retrieve access token.");
  }
});

// Step 3: Create event endpoint
app.post("/events", async (req, res) => {
  if (!token) {
    return res.status(401).send("No token found. Please authorize first at /authorize.");
  }

  oAuth2Client.setCredentials(token);

  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  const event = {
    summary: req.body.summary || "Test Event",
    location: req.body.location || "Online",
    description: req.body.description || "Created via API",
    start: { dateTime: req.body.start_time },
    end: { dateTime: req.body.end_time },
    attendees: req.body.attendees ? req.body.attendees.map(email => ({ email })) : [],
  };

  try {
    const response = await calendar.events.insert({
      auth: oAuth2Client,
      calendarId: "primary",
      resource: event,
    });
    res.status(200).json(response.data);
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).send("Failed to create event.");
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
