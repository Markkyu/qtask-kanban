const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json());

// Serve uploaded files statically so the frontend can preview images
// e.g. GET http://localhost:5000/uploads/3/1234567890-123456.png
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Routes ───────────────────────────────────────────────────
app.use("/api/register", require("./routes/register"));
app.use("/api/login", require("./routes/login"));
app.use("/api/phases", require("./routes/phases"));
app.use("/api/statuses", require("./routes/statuses"));
app.use("/api/severities", require("./routes/severities"));
app.use("/api/tasks", require("./routes/tasks"));
app.use("/api/users", require("./routes/users"));
app.use("/api/attachments", require("./routes/attachments"));

// ── Health check ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ message: "Q-Task API is running", version: "1.0.0" });
});

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Q-Task API running on http://localhost:${PORT}`);
});
