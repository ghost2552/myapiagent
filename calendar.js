const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const CREDENTIALS_PATH = path.join(__dirname, "client_secret.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

function loadClient() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);

  // Use "web" section of client_secret.json
  const { client_secret, client_id, redirect_uris } = credentials.web;

  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

function authorize(callback) {
  const oAuth2Client = loadClient();

  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  } else {
    console.log("⚠️ No token.json found. Please authorize the app.");
  }
}

function createEvent(auth, event, callback) {
  const calendar = google.calendar({ version: "v3", auth });

  calendar.events.insert(
    {
      auth,
      calendarId: "primary",
      resource: event,
    },
    (err, res) => {
      if (err) {
        console.error("Error creating event:", err);
        callback(err, null);
        return;
      }
      console.log("✅ Event created:", res.data.htmlLink);
      callback(null, res.data);
    }
  );
}

function scheduleEvent(event, callback) {
  authorize((auth) => {
    createEvent(auth, event, callback);
  });
}

module.exports = {
  createEvent: scheduleEvent, // ✅ Export as createEvent (so server.js works)
};
