const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// GET /api/users
// Returns all active users for the assignee dropdown.
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, username, role FROM users WHERE isActive = 1 ORDER BY name ASC",
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /users error:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

module.exports = router;
