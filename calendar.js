const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const app = express();
const PORT = process.env.PORT || 10000;

// Path to client secret JSON
const CREDENTIALS_PATH = path.join(__dirname, "client_secret_703184561095-rhjck2ccik10fo0vns0he6a9c8c3a526.apps.googleusercontent.com.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

// Middleware
app.use(bodyParser.json());

// Load client secrets
function loadCredentials() {
  const content = fs.readFileSync(CREDENTIALS_PATH, "utf8");
  return JSON.parse(content).installed || JSON.parse(content).web;
}

// Authorize and return OAuth2 client
function authorize(callback) {
  const credentials = loadCredentials();
  const { client_secret, client_id, redirect_uris } = credentials;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    oAuth2Client.setCredentials(token);
    callback(oAuth2Client);
  } else {
    throw new Error("No token.json found. Please visit /authorize to authenticate.");
  }
}

// Route to start OAuth2 flow
app.get("/authorize", (req, res) => {
  try {
    const credentials = loadCredentials();
    const { client_secret, client_id, redirect_uris } = credentials;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/calendar.events"],
    });

    res.redirect(authUrl);
  } catch (err) {
    console.error("Error in /authorize:", err);
    res.status(500).send("Authorization error: " + err.message);
  }
});

// Callback route
app.get("/oauth2callback", async (req, res) => {
  try {
    const credentials = loadCredentials();
    const { client_secret, client_id, redirect_uris } = credentials;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    const { tokens } = await oAuth2Client.getToken(req.query.code);
    oAuth2Client.setCredentials(tokens);

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.send("Authorization successful! Token saved.");
  } catch (err) {
    console.error("Error in /oauth2callback:", err);
    res.status(500).send("Callback error: " + err.message);
  }
});

// Event creation endpoint
app.post("/events", (req, res) => {
  authorize((auth) => {
    const calendar = google.calendar({ version: "v3", auth });
    const event = req.body;

    calendar.events.insert(
      {
        calendarId: "primary",
        resource: event,
      },
      (err, eventRes) => {
        if (err) {
          console.error("Error creating event:", err);
          res.status(500).send("Error creating event: " + err.message);
          return;
        }
        res.send(`Event created: ${eventRes.data.htmlLink}`);
      }
    );
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
