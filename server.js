import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";

const app = express();
app.use(bodyParser.json());

// Load credentials from GOOGLE_CREDENTIALS env var
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (err) {
  console.error("❌ GOOGLE_CREDENTIALS not set or invalid JSON:", err);
  process.exit(1);
}

// Setup Google Auth
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: credentials.client_email,
    private_key: credentials.private_key.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({ version: "v3", auth });

// POST /events -> schedule on Google Calendar
app.post("/events", async (req, res) => {
  console.log("--- RAW VAPI REQUEST ---");
  console.log(JSON.stringify(req.body, null, 2));

  try {
    const { summary, start, end, description, location, attendees } =
      req.body.arguments;

    const event = {
      summary,
      location,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
      attendees: attendees.map((email) => ({ email })),
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    res.json({
      toolCallId: req.body.toolCallId,
      result: response.data,
    });
  } catch (error) {
    console.error("❌ Error creating event:", error);
    res.status(500).send("Error creating event: " + error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
