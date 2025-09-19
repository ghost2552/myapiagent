// server.js
const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const calendar = require("./calendar");

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => {
  res.send("✅ Server is running on Render!");
});

// ✅ Finalized endpoint
app.post("/webhook/v1/events", async (req, res) => {
  try {
    const { summary, location, description, start_time, end_time, attendees } =
      req.body;

    const event = await calendar.createEvent({
      summary,
      location,
      description,
      start_time,
      end_time,
      attendees,
    });

    res.status(200).json({
      ok: true,
      message: `Event '${summary}' created successfully!`,
      event,
    });
  } catch (error) {
    console.error("❌ Error creating event:", error);
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
