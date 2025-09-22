import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { google } from "googleapis";

const app = express();

// ✅ Allow all origins for now (you can restrict later)
app.use(cors());
app.use(bodyParser.json());

// Google Calendar setup...
// (your existing code here)

// Example POST endpoint
app.post("/events", async (req, res) => {
  try {
    const { summary, description, location, start, end, attendees } = req.body;

    const event = {
      summary,
      description,
      location,
      start: { dateTime: start, timeZone: "UTC" },
      end: { dateTime: end, timeZone: "UTC" },
      attendees: attendees ? attendees.map(email => ({ email })) : [],
    };

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    res.status(200).json({ success: true, event: response.data });
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
