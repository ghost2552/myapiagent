import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function getOAuthClient() {
  let credentials;
  if (process.env.GOOGLE_CREDENTIALS) {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  } else {
    throw new Error("GOOGLE_CREDENTIALS not set in environment variables.");
  }

  const { client_id, client_secret, redirect_uris } = credentials.web;

  return new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );
}

// Store tokens in memory (later we can move to Redis/DB if needed)
let oauthTokens = null;

app.get("/authorize", (req, res) => {
  const oAuth2Client = getOAuthClient();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

app.get("/oauth2callback", async (req, res) => {
  try {
    const oAuth2Client = getOAuthClient();
    const { code } = req.query;
    const { tokens } = await oAuth2Client.getToken(code);
    oauthTokens = tokens;
    oAuth2Client.setCredentials(tokens);
    res.send("✅ Authorization successful! You can now use the API.");
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("Error during authorization.");
  }
});

app.post("/events", async (req, res) => {
  try {
    if (!oauthTokens) {
      return res.status(400).send("❌ Not authorized yet. Visit /authorize first.");
    }

    const oAuth2Client = getOAuthClient();
    oAuth2Client.setCredentials(oauthTokens);

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    const event = {
      summary: req.body.summary,
      location: req.body.location,
      description: req.body.description,
      start: { dateTime: req.body.start.dateTime },
      end: { dateTime: req.body.end.dateTime },
      attendees: req.body.attendees || [],
    };

    const result = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    res.status(200).json(result.data);
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).send("Error creating event");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
