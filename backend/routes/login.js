const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db"); // mysql2/promise pool
const loginRouter = express.Router();

// Login endpoint /api/login
loginRouter.post("/", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res
      .status(400)
      .json({ message: "Username and password are required" });

  try {
    const [results] = await pool.query(
      `SELECT * FROM accounts WHERE username = ?`,
      [username],
    );

    if (results.length === 0)
      return res.status(404).json({ message: "User not found" });

    const user = results[0];

    // Compare password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch)
      return res.status(401).json({ message: "Invalid credentials" });

    // Remove password from result
    const { password: _, ...safeUser } = user;

    return res.json({
      message: "Login successful",
      user: safeUser,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Error during login" });
  }
});

module.exports = loginRouter;
