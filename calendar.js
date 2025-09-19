const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const TOKEN_PATH = path.join(__dirname, "token.json");
const CREDENTIALS_PATH = path.join(
  __dirname,
  "client_secret_703184561095-rhjck2ccik10fo0vns0he6a9c8c3a526.apps.googleusercontent.com.json"
);

// Load client secrets from the local file
function loadClient() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);

  // FIX: use "web" instead of "installed"
  const { client_secret, client_id, redirect_uris } = credentials.web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check for previously stored token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
  } else {
    console.log("No token.json found. Please generate one with OAuth consent.");
  }

  return oAuth2Client;
}

// Create a Google Calendar event
async function createEvent(auth, eventDetails) {
  const calendar = google.calendar({ version: "v3", auth });

  try {
    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: eventDetails,
    });

    console.log("✅ Event created successfully:", response.data.htmlLink);
    return response.data;
  } catch (err) {
    console.error("❌ Error creating event:", err);
    throw err;
  }
}

module.exports = { loadClient, createEvent };
