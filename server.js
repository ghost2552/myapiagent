import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(bodyParser.json());

// Google Auth
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({ version: "v3", auth });

// Protect API with VAPI key (optional but recommended)
app.use((req, res, next) => {
  const vapiKey = req.headers["x-vapi-key"];
  if (process.env.VAPI_SECRET && vapiKey !== process.env.VAPI_SECRET) {
    return res.status(403).json({ error: "Forbidden: Invalid API key" });
  }
  next();
});

// Create event endpoint
app.post("/events", async (req, res) => {
  try {
    const { summary, description, location, start, end, attendees } = req.body;

    if (!summary || !start || !end) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const event = {
      summary,
      description,
      location,
      start: { dateTime: start },
      end: { dateTime: end },
      attendees: attendees?.map((email) => ({ email })) || [],
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
