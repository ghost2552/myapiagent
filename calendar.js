const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];
const TOKEN_PATH = path.join(__dirname, "token.json");

// 👉 Use your original filename, do NOT rename the file
const CREDENTIALS_PATH = path.join(
  __dirname,
  "client_secret_703184561095-rhjck2ccik10fo0vns0he6a9c8c3a526.apps.googleusercontent.com.json"
);

function loadCredentials() {
  const content = fs.readFileSync(CREDENTIALS_PATH, "utf8");
  return JSON.parse(content).installed || JSON.parse(content).web;
}

async function authorize() {
  const credentials = loadCredentials();
  const { client_secret, client_id, redirect_uris } = credentials;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    oAuth2Client.setCredentials(token);
  } else {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });
    console.log("Authorize this app by visiting this URL:", authUrl);

    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    readline.question("Enter the code from that page here: ", async (code) => {
      readline.close();
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);

      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log("Token stored to", TOKEN_PATH);
    });
  }

  return oAuth2Client;
}

async function createEvent(auth) {
  const calendar = google.calendar({ version: "v3", auth });

  const event = {
    summary: "Authorization Test Event",
    location: "Online",
    description: "Testing Google Calendar API authorization",
    start: {
      dateTime: "2025-09-21T15:00:00+03:00",
      timeZone: "Asia/Jerusalem",
    },
    end: {
      dateTime: "2025-09-21T16:00:00+03:00",
      timeZone: "Asia/Jerusalem",
    },
    attendees: [{ email: "test@example.com" }],
  };

  try {
    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });
    console.log("✅ Event created:", response.data.htmlLink);
  } catch (error) {
    console.error("❌ Error creating event:", error);
  }
}

authorize().then(createEvent).catch(console.error);
