const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");

const app = express();
app.use(bodyParser.json());

// your Vapi secret
const VAPI_SECRET = process.env.VAPI_SECRET || "change_this_secret";

// Google Calendar setup
const calendar = google.calendar({ version: "v3" });
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/calendar"]
);
google.options({ auth });

// test route
app.get("/", (req, res) => {
  res.send("✅ Vapi Google Calendar Agent is running.");
});

// Vapi → Google Calendar
app.post("/events", async (req, res) => {
  try {
    const apiKey = req.headers["x-vapi-key"];
    if (apiKey !== VAPI_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log("--- RAW VAPI REQUEST ---");
    console.log(req.body);

    const { arguments: args } = req.body;
    if (!args || !args.start || !args.end || !args.summary) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const event = {
      summary: args.summary,
      description: args.description || "",
      location: args.location || "",
      start: { dateTime: args.start },
      end: { dateTime: args.end },
      attendees: (args.attendees || []).map(email => ({ email })),
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    res.json({
      results: {
        toolCallId: req.body.toolCallId || "manual-test",
        result: { eventId: response.data.id },
      },
    });
  } catch (err) {
    console.error("Error inserting event:", err);
    res.status(500).json({ error: "Failed to create event" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
