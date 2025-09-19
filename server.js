// server.js
const express = require('express');
const app = express();
const port = 3000;

// Middleware to parse JSON
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.send('Hello, world!');
});

// Webhook route
app.post('/webhook/v1', (req, res) => {
  console.log("📥 Incoming webhook:", req.body);

  // Validate x-vapi-key
  const apiKey = req.headers["x-vapi-key"];
  if (apiKey !== "change_this_secret") {
    return res.status(403).json({ error: "Forbidden: invalid API key" });
  }

  // Example: parse function call
  const { function: func } = req.body;
  if (func && func.name === "create_calendar_event") {
    const { summary, start_time, end_time, attendees } = func.parameters;
    console.log(`📅 Creating event: ${summary} from ${start_time} to ${end_time} with attendees: ${attendees}`);

    return res.json({
      ok: true,
      message: `Event '${summary}' created successfully!`
    });
  }

  res.json({ ok: true, message: "Webhook received!" });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running at http://localhost:${port}`);
});
