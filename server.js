const { google } = require("googleapis");
const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Load credentials from Render env var
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (e) {
  console.error("❌ Failed to parse GOOGLE_CREDENTIALS:", e);
  process.exit(1);
}

const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key?.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/calendar.events"]
);

const calendar = google.calendar({ version: "v3", auth });

// Test route
app.get("/", (req, res) => {
  res.send("✅ Server is running and ready to handle VAPI requests.");
});

// VAPI event creation
app.post("/events", async (req, res) => {
  console.log("--- RAW VAPI REQUEST ---");
  console.log(JSON.stringify(req.body, null, 2));

  try {
    const { arguments: args } = req.body;

    if (!args || !args.start || !args.end || !args.summary) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const event = {
      summary: args.summary,
      description: args.description || "",
      start: { dateTime: args.start },
      end: { dateTime: args.end },
      location: args.location || "",
      attendees: (args.attendees || []).map(email => ({ email })),
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    res.json({
      results: [
        {
          toolCallId: req.body.toolCallId || "manual-test",
          result: {
            message: `✅ Event created: ${event.summary}`,
            eventId: response.data.id,
            link: response.data.htmlLink,
          },
        },
      ],
    });
  } catch (err) {
    console.error("❌ Error creating event:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
