const express = require("express");
const registerRouter = express.Router();
const bcrypt = require("bcrypt");
const pool = require("../config/db"); // mysql2/promise pool

// REGISTER endpoint
registerRouter.post("/", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long.",
      });
    }

    // Check if user exists
    const [existingUser] = await pool.query(
      "SELECT * FROM accounts WHERE username = ?",
      [username],
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const [result] = await pool.query(
      "INSERT INTO accounts (username, password) VALUES (?, ?)",
      [username, hashedPassword],
    );

    res.status(201).json({ message: "User Created" });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = registerRouter;
