// server.js
const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');

const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.json());

// ---------------- GOOGLE AUTH ---------------- //
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
const tokens = JSON.parse(process.env.GOOGLE_TOKENS || '{}');

const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web || {};
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);

if (tokens.refresh_token) {
  oAuth2Client.setCredentials(tokens);
} else {
  console.error("⚠️ No refresh token found in GOOGLE_TOKENS");
}

const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

// ---------------- EVENTS ENDPOINT ---------------- //
app.post('/events', async (req, res) => {
  try {
    console.log('--- RAW VAPI REQUEST ---');
    console.log(JSON.stringify(req.body, null, 2));

    // Extract arguments from Vapi tool call format
    const toolCall = req.body?.message?.toolCallList?.[0];
    const args = toolCall?.arguments || {};

    const { summary, description, location, start, end, attendees } = args;

    if (!summary || !start || !end) {
      return res.status(400).json({ error: 'Missing required fields: summary, start, end' });
    }

    const event = {
      summary,
      description,
      location,
      start: { dateTime: start, timeZone: 'UTC' },
      end: { dateTime: end, timeZone: 'UTC' },
      attendees: attendees ? attendees.map(email => ({ email })) : []
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    console.log('✅ Event created:', result.data.htmlLink);

    // Respond in Vapi format
    res.json({
      results: [
        {
          toolCallId: toolCall?.id || 'manual-test',
          result: `Event created: ${summary} (${start} → ${end})`
        }
      ]
    });

  } catch (err) {
    console.error('❌ Error creating event:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- ROOT ---------------- //
app.get('/', (req, res) => {
  res.send('✅ Vapi Calendar API is running.');
});

// ---------------- START SERVER ---------------- //
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`==> Available at your primary URL`);
});
