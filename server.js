// server.js
const express = require("express");
const bodyParser = require("body-parser");
const calendarRoutes = require("./calendar"); // import calendar routes

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// health check
app.get("/", (req, res) => {
  res.send("✅ Calendar API is live on Render!");
});

// calendar routes (main endpoint)
app.use("/events", calendarRoutes);

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
