import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ✅ Test route (just to check server is alive)
app.get("/", (req, res) => {
  res.send("API is running!");
});

// ✅ Your events route
app.post("/events", async (req, res) => {
  console.log("Incoming event:", req.body);

  const { summary, description, location, start, end, attendees } = req.body;

  if (!summary || !start || !end) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Mock success response
  res.status(200).json({
    message: "Event created successfully",
    event: { summary, description, location, start, end, attendees }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
