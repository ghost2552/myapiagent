const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");

const app = express();
app.use(bodyParser.json());

app.post("/events", async (req, res) => {
  try {
    console.log("--- RAW VAPI REQUEST ---");
    console.log(req.body); // log full body from Vapi

    const { summary, start, end, description, location, attendees } = req.body;

    if (!summary || !start || !end) {
      return res.status(400).json({ error: "Missing required fields: summary, start, end" });
    }

    // Google OAuth2 client setup (replace with your tokens)
    const oAuth2Client = new google.auth.OAuth2();
    oAuth2Client.setCredentials({
      access_token: process.env.ACCESS_TOKEN,
      refresh_token: process.env.REFRESH_TOKEN,
    });

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    const event = {
      summary,
      location,
      description,
      start: { dateTime: start, timeZone: "UTC" },
      end: { dateTime: end, timeZone: "UTC" },
      attendees: attendees ? attendees.map(email => ({ email })) : [],
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    res.json({ message: "Event created", event: response.data });
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
