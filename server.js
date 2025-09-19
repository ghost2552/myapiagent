const fs = require("fs");
const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

// Load credentials from environment variable instead of file
function loadCredentials() {
  if (!process.env.GOOGLE_CREDENTIALS) {
    throw new Error("❌ GOOGLE_CREDENTIALS env variable not set.");
  }
  return JSON.parse(process.env.GOOGLE_CREDENTIALS);
}

function createOAuthClient() {
  const credentials = loadCredentials();
  const { client_secret, client_id, redirect_uris } = credentials.web;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

// Authorization route
app.get("/authorize", (req, res) => {
  const oAuth2Client = createOAuthClient();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
  });
  res.redirect(authUrl);
});

// OAuth2 callback
app.get("/oauth2callback", async (req, res) => {
  const oAuth2Client = createOAuthClient();
  const { code } = req.query;
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Save refresh token securely (for now in a file)
    fs.writeFileSync("token.json", JSON.stringify(tokens));

    res.send("✅ Authorization successful! You can close this tab.");
  } catch (err) {
    console.error("Error exchanging code:", err);
    res.status(500).send("Error retrieving access token");
  }
});

// Example event creation route
app.post("/events", async (req, res) => {
  try {
    const oAuth2Client = createOAuthClient();
    const tokens = JSON.parse(fs.readFileSync("token.json"));
    oAuth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
    const event = req.body;

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    res.send(response.data);
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
