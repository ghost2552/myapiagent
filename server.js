const express = require("express");
const bodyParser = require("body-parser");
const { loadClient, createEvent } = require("./calendar");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// ✅ Root test
app.get("/", (req, res) => {
  res.send("Google Calendar API Server is running ✅");
});

// ✅ Create event endpoint
app.post("/events", async (req, res) => {
  try {
    const auth = loadClient();
    const eventDetails = req.body;

    const event = await createEvent(auth, eventDetails);
    res.json({ ok: true, event });
  } catch (err) {
    console.error("Error creating event:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
