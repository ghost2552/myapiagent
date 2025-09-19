const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Path to token file
const TOKEN_PATH = path.join(__dirname, 'token.json');

// Your OAuth2 credentials
const CLIENT_ID = "703184561095-rhjck2ccik10fo0vns0he6a9c8c3a526.apps.googleusercontent.com";
const CLIENT_SECRET = "YOUR_CLIENT_SECRET";  // Replace with your actual client secret
const REDIRECT_URI = "https://myapiagent.onrender.com/oauth2callback";

// Create OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Load token from file
function loadToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return token;
  }
  return null;
}

// Save token to file
function saveToken(token) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
  console.log("✅ Token refreshed and saved!");
}

// Refresh token if expired
async function refreshAccessTokenIfNeeded() {
  const token = loadToken();

  if (!token || !token.refresh_token) {
    throw new Error("❌ No refresh token found. Re-authorize the app.");
  }

  try {
    const newTokens = await oAuth2Client.refreshAccessToken();
    const updatedToken = {
      ...token,
      ...newTokens.credentials,
    };
    saveToken(updatedToken);
    oAuth2Client.setCredentials(updatedToken);
    return oAuth2Client;
  } catch (err) {
    console.error("❌ Error refreshing access token:", err);
    throw err;
  }
}

// Create a Google Calendar event
async function createCalendarEvent(event) {
  try {
    await refreshAccessTokenIfNeeded();

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    const res = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    console.log("✅ Event created:", res.data.htmlLink);
    return res.data;
  } catch (error) {
    console.error("❌ Error creating event:", error);
    throw error;
  }
}

module.exports = { createCalendarEvent };
