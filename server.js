require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const calendar = require("./calendar");

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(bodyParser.json());

// Root endpoint
app.get("/", (req, res) => {
  res.send("✅ API is running. Use POST /webhook/v1/events to create events.");
});

// Create event endpoint
app.post("/webhook/v1/events", (req, res) => {
  const event = req.body;

  if (!event.summary || !event.start_time || !event.end_time) {
    return res.status(400).json({ error: "Missing required event fields" });
  }

  console.log("📩 Incoming event request:", event);

  calendar.createEvent(event, (err, response) => {
    if (err) {
      console.error("❌ Google Calendar API error:", err.errors || err);
      return res
        .status(500)
        .json({ error: "Google Calendar API error", details: err.errors || err });
    }
    res.json({ message: "✅ Event created", event: response });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
