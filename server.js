const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Debug middleware (log all incoming requests)
app.use((req, res, next) => {
  console.log('--- RAW VAPI REQUEST ---');
  console.log(JSON.stringify(req.body, null, 2));
  next();
});

// Events endpoint
app.post('/events', (req, res) => {
  // Support both Vapi-style { arguments: {...} } and direct { summary, start, end... }
  const args = req.body.arguments || req.body;

  if (!args || !args.summary || !args.start || !args.end) {
    return res.status(400).json({ error: 'Missing required fields: summary, start, end' });
  }

  // Respond in Vapi format
  res.json({
    results: [
      {
        toolCallId: req.body.toolCallId || "manual-test",
        result: {
          message: `✅ Event created: ${args.summary} from ${args.start} to ${args.end}`,
          event: args
        }
      }
    ]
  });
});

// Root endpoint for sanity check
app.get('/', (req, res) => {
  res.send('🚀 Vapi Google Calendar backend is running!');
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Your service is live at https://myapiagent.onrender.com`);
});
