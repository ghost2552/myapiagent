import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Load credentials from environment
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const { client_id, client_secret, redirect_uris } = credentials.installed;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

// Set the access token from environment if available
if (process.env.GOOGLE_TOKEN) {
  oAuth2Client.setCredentials(JSON.parse(process.env.GOOGLE_TOKEN));
}

const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

// Health check
app.get("/", (req, res) => {
  res.send("✅ Google Calendar API server is running");
});

// Create event
app.post("/events", async (req, res) => {
  try {
    console.log("📩 Incoming request:", req.body);

    const { summary, description, location, start, end, attendees } = req.body;

    if (!summary || !start || !end) {
      return res.status(400).json({
        error: "Missing required fields: summary, start, end",
      });
    }

    const event = {
      summary,
      description,
      location,
      start: { dateTime: start, timeZone: "UTC" }, // 👈 FIXED
      end: { dateTime: end, timeZone: "UTC" },     // 👈 FIXED
      attendees: attendees?.map((email) => ({ email })) || [],
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    res.json({
      message: "✅ Event created successfully",
      eventLink: response.data.htmlLink,
    });
  } catch (error) {
    console.error("❌ Error creating event:", error.response?.data || error.message);
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

// Port binding for Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
