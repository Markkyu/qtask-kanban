const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// GET /api/severities
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM severities ORDER BY sortOrder ASC",
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /severities error:", err);
    res.status(500).json({ message: "Failed to fetch severities" });
  }
});

module.exports = router;
