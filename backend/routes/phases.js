const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// GET /api/phases
// Returns all statuses ordered by sortOrder.
// Used by the Kanban board to build columns dynamically.
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM phases ORDER BY sortOrder ASC",
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /phases error:", err);
    res.status(500).json({ message: "Failed to fetch phases" });
  }
});

// POST /api/phases
// Creates a new phase (Admin only in full system).
router.post("/", async (req, res) => {
  const { label, sortOrder = 0, isDefault = 0, isFinal = 0 } = req.body;
  if (!label?.trim())
    return res.status(400).json({ message: "Label is required" });

  try {
    const [result] = await pool.query(
      "INSERT INTO phases (label, sortOrder, isDefault, isFinal) VALUES (?, ?, ?, ?)",
      [label.trim(), sortOrder, isDefault ? 1 : 0, isFinal ? 1 : 0],
    );
    const [rows] = await pool.query("SELECT * FROM phases WHERE id = ?", [
      result.insertId,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Phase label already exists" });
    console.error("POST /phases error:", err);
    res.status(500).json({ message: "Failed to create phase" });
  }
});

// PUT /api/phases/:id
// Rename or reorder a phase.
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { label, sortOrder, isDefault, isFinal } = req.body;
  try {
    await pool.query(
      "UPDATE phases SET label = ?, sortOrder = ?, isDefault = ?, isFinal = ? WHERE id = ?",
      [label, sortOrder, isDefault ? 1 : 0, isFinal ? 1 : 0, id],
    );
    const [rows] = await pool.query("SELECT * FROM phases WHERE id = ?", [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error("PUT /phases/:id error:", err);
    res.status(500).json({ message: "Failed to update phase" });
  }
});

// DELETE /api/phases/:id
// Blocked if any tasks are using this phase (SRS §1.2 referential integrity).
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [tasks] = await pool.query(
      "SELECT COUNT(*) AS count FROM tasks WHERE statusId = ?",
      [id],
    );
    if (tasks[0].count > 0) {
      return res.status(400).json({
        message:
          "Cannot delete: This phase is currently in use by active tasks.",
      });
    }
    await pool.query("DELETE FROM phases WHERE id = ?", [id]);
    res.json({ message: "Phase deleted" });
  } catch (err) {
    console.error("DELETE /phases/:id error:", err);
    res.status(500).json({ message: "Failed to delete phase" });
  }
});

module.exports = router;
