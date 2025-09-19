// server.js
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Import calendar routes
const calendar = require("./calendar.js");
app.use("/webhook/v1", calendar);

app.get("/", (req, res) => {
  res.send("✅ Calendar API is live on Render!");
});

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
