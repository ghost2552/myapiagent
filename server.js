// server.js
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Import calendar routes
const calendar = require("./calendar.js");
app.use("/webhook/v1", calendar);

// Root route to confirm service is running
app.get("/", (req, res) => {
  res.send("✅ Calendar API is live on Render!");
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
