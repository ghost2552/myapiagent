const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const cors = require('cors');   // ✅ enable cross-origin requests

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());                // ✅ allow Vapi dashboard & browser requests
app.use(bodyParser.json());

// ========================
// Google OAuth2 setup
// ========================
const oAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Load tokens from env
if (process.env.GOOGLE_TOKENS) {
  try {
    oAuth2Client.setCredentials(JSON.parse(process.env.GOOGLE_TOKENS));
    console.log("✅ Google tokens loaded from env.");
  } catch (err) {
    console.error("❌ Failed to parse GOOGLE_TOKENS:", err);
  }
}

// ========================
// Root health check
// ========================
app.get('/', (req, res) => {
  res.send('✅ API server is running');
});

// ========================
// Events endpoint for Vapi
// ========================
app.post('/events', async (req, res) => {
  try {
    console.log('--- RAW VAPI REQUEST ---');
    console.log(JSON.stringify(req.body, null, 2));

    // Extract tool call from Vapi payload
    const toolCall = req.body?.message?.toolCallList?.[0];
    if (!toolCall) {
      return res.status(400).json({ error: 'Invalid Vapi payload' });
    }

    const { id: toolCallId, arguments: args } = toolCall;

    console.log('--- EXTRACTED ARGUMENTS ---');
    console.log(args);

    // Setup Google Calendar API
    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    const event = {
      summary: args.summary,
      description: args.description || '',
      location: args.location || '',
      start: { dateTime: args.start },
      end: { dateTime: args.end },
      attendees: (args.attendees || []).map(email => ({ email })),
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    console.log('--- GOOGLE CALENDAR RESPONSE ---');
    console.log(response.data);

    // Send response back to Vapi
    res.json({
      results: [
        {
          toolCallId,
          result: `✅ Event created: ${args.summary} (${args.start} → ${args.end})`
        }
      ]
    });

  } catch (err) {
    console.error('❌ Error handling /events:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ========================
// Start server
// ========================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
