const express = require("express");
const bodyParser = require("body-parser");
const { createCalendarEvent } = require("./calendar");

const app = express();
const PORT = process.env.PORT || 10000; // Render will override with its own port

app.use(bodyParser.json());

// Root route
app.get("/", (req, res) => {
  res.send("✅ Google Calendar API is running!");
});

// Event creation route
app.post("/events", async (req, res) => {
  try {
    const { summary, location, description, start_time, end_time, attendees } = req.body;

    if (!summary || !start_time || !end_time) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const event = {
      summary,
      location,
      description,
      start: {
        dateTime: start_time,
        timeZone: "UTC",
      },
      end: {
        dateTime: end_time,
        timeZone: "UTC",
      },
      attendees: attendees ? attendees.map(email => ({ email })) : [],
    };

    const result = await createCalendarEvent(event);
    res.status(200).json({ message: "✅ Event created!", link: result.htmlLink });
  } catch (error) {
    console.error("❌ Error in /events route:", error.message || error);
    res.status(500).json({ error: "Failed to create event", details: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
