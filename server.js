import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";

const app = express();
app.use(bodyParser.json());

// Setup Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  access_token: process.env.GOOGLE_ACCESS_TOKEN,
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  scope: "https://www.googleapis.com/auth/calendar.events",
  token_type: "Bearer",
  expiry_date: process.env.GOOGLE_EXPIRY_DATE,
});

// POST /events endpoint for Vapi
app.post("/events", async (req, res) => {
  console.log("========== RAW VAPI REQUEST ==========");
  console.log(JSON.stringify(req.body, null, 2)); // pretty print full request
  console.log("======================================");

  // ✅ Log only arguments
  console.log(">> Vapi Arguments:");
  console.log(req.body.arguments || {});
  console.log("======================================");

  const args = req.body.arguments || {};
  const { summary, start, end, description, location, attendees } = args;

  if (!summary || !start || !end) {
    console.warn("⚠️ Missing required fields:", { summary, start, end });
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const event = {
      summary,
      location,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
      attendees: attendees?.map(email => ({ email })) || []
    };

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const result = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    console.log("✅ Event created:", result.data.id);

    return res.json({ success: true, event: result.data });
  } catch (err) {
    console.error("❌ Error creating event:", err.response?.data || err.message);
    return res.status(500).json({ error: "Failed to create event" });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
