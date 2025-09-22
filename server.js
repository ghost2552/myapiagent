import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { google } from "googleapis";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(bodyParser.json());

// Google Auth setup
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({ version: "v3", auth });

// Health check route
app.get("/", (req, res) => {
  res.send("🚀 Google Calendar API is running!");
});

// Create calendar event route
app.post("/events", async (req, res) => {
  try {
    const { summary, description, location, start, end, attendees } = req.body;

    if (!summary || !start || !end) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const event = {
      summary,
      description,
      location,
      start: { dateTime: start, timeZone: "UTC" },
      end: { dateTime: end, timeZone: "UTC" },
      attendees: attendees ? attendees.map((email) => ({ email })) : [],
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
    console.error("❌ Error creating event:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
