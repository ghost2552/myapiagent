const express = require("express");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Paths for credentials and tokens
const CREDENTIALS_PATH = path.join(__dirname, "client_secret_703184561095-rhjck2ccik10fo0vns0he6a9c8c3a526.apps.googleusercontent.com.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

// Load client secrets
function loadCredentials() {
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
}

// OAuth2 client setup
function createOAuthClient() {
  const credentials = loadCredentials().installed || loadCredentials().web;
  return new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uris[0]
  );
}

// ================= ROUTES ================= //

// Route to start OAuth2 flow
app.get("/authorize", (req, res) => {
  const oAuth2Client = createOAuthClient();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"],
    prompt: "consent"
  });
  res.redirect(authUrl);
});

// OAuth2 callback
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No code provided.");

  const oAuth2Client = createOAuthClient();
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.send("✅ Authorization successful! You can now close this tab.");
  } catch (err) {
    console.error("Error retrieving access token", err);
    res.status(500).send("Error during authentication");
  }
});

// Route to create calendar event
app.post("/events", async (req, res) => {
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    const oAuth2Client = createOAuthClient();
    oAuth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
    const event = {
      summary: req.body.summary,
      location: req.body.location,
      description: req.body.description,
      start: { dateTime: req.body.start_time },
      end: { dateTime: req.body.end_time },
      attendees: req.body.attendees.map(email => ({ email }))
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    res.json(response.data);
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).send("Error creating event");
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
