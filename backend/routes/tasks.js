const express = require("express");
const router  = express.Router();
const pool    = require("../config/db");

// ─── Helper: build a full task object with joined data ───────────────────────
// The Kanban column is now driven by phaseId.
// statusId is still stored on the task as a secondary attribute (the task's
// QA/workflow status), but it no longer determines which column the card lives in.
async function getTaskById(id) {
  const [rows] = await pool.query(
    `SELECT
       t.id, t.title, t.description, t.progress,
       t.targetDate, t.actualEndDate, t.createdAt, t.updatedAt,
       t.phaseId,    p.label  AS phaseLabel,
       p.isFinal    AS phaseIsFinal,
       p.isDefault  AS phaseIsDefault,
       t.statusId,  s.label  AS statusLabel,
       t.severityId, sv.label AS severityLabel,
       t.assigneeId, u.name   AS assigneeName, u.username AS assigneeUsername
     FROM tasks t
     LEFT JOIN phases     p  ON t.phaseId    = p.id
     LEFT JOIN statuses   s  ON t.statusId   = s.id
     LEFT JOIN severities sv ON t.severityId = sv.id
     LEFT JOIN users      u  ON t.assigneeId = u.id
     WHERE t.id = ?`,
    [id]
  );
  if (rows.length === 0) return null;
  const task = rows[0];

  const [subtasks] = await pool.query(
    "SELECT id, title, isDone FROM subtasks WHERE taskId = ? ORDER BY id ASC",
    [id]
  );
  task.subtasks = subtasks;
  return task;
}

// ─── GET /api/tasks ──────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         t.id, t.title, t.description, t.progress,
         t.targetDate, t.actualEndDate, t.createdAt, t.updatedAt,
         t.phaseId,    p.label  AS phaseLabel,
         p.isFinal    AS phaseIsFinal,
         p.isDefault  AS phaseIsDefault,
         t.statusId,  s.label  AS statusLabel,
         t.severityId, sv.label AS severityLabel,
         t.assigneeId, u.name   AS assigneeName, u.username AS assigneeUsername
       FROM tasks t
       LEFT JOIN phases     p  ON t.phaseId    = p.id
       LEFT JOIN statuses   s  ON t.statusId   = s.id
       LEFT JOIN severities sv ON t.severityId = sv.id
       LEFT JOIN users      u  ON t.assigneeId = u.id
       ORDER BY t.createdAt DESC`
    );

    for (const task of rows) {
      const [subtasks] = await pool.query(
        "SELECT id, title, isDone FROM subtasks WHERE taskId = ? ORDER BY id ASC",
        [task.id]
      );
      task.subtasks = subtasks;
    }

    res.json(rows);
  } catch (err) {
    console.error("GET /tasks error:", err);
    res.status(500).json({ message: "Failed to fetch tasks" });
  }
});

// ─── POST /api/tasks ─────────────────────────────────────────────────────────
// Creates a new task. phaseId defaults to the phase where isDefault = 1.
router.post("/", async (req, res) => {
  const { title, description, phaseId, statusId, severityId, assigneeId, targetDate } = req.body;

  if (!title?.trim())
    return res.status(400).json({ message: "Title is required" });

  try {
    // Resolve default phase if not provided
    let resolvedPhaseId = phaseId;
    if (!resolvedPhaseId) {
      const [defaults] = await pool.query(
        "SELECT id FROM phases WHERE isDefault = 1 LIMIT 1"
      );
      if (defaults.length === 0)
        return res.status(500).json({ message: "No default phase configured. Run schema_phases_update.sql first." });
      resolvedPhaseId = defaults[0].id;
    }

    const [result] = await pool.query(
      `INSERT INTO tasks
         (title, description, phaseId, statusId, severityId, assigneeId, targetDate, progress)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        title.trim(),
        description ?? null,
        resolvedPhaseId,
        statusId   ?? null,
        severityId ?? null,
        assigneeId ?? null,
        targetDate ?? null,
      ]
    );

    await pool.query(
      "INSERT INTO activity_logs (taskId, action) VALUES (?, ?)",
      [result.insertId, "Task created"]
    );

    const task = await getTaskById(result.insertId);
    res.status(201).json(task);
  } catch (err) {
    console.error("POST /tasks error:", err);
    res.status(500).json({ message: "Failed to create task" });
  }
});

// ─── PATCH /api/tasks/:id/phase ──────────────────────────────────────────────
// Moves a task to a new phase column (Kanban drag-and-drop).
// Replaces the old /status endpoint as the primary drag handler.
// If the target phase has isFinal = 1, actualEndDate is required.
router.patch("/:id/phase", async (req, res) => {
  const { id }                   = req.params;
  const { phaseId, actualEndDate } = req.body;

  if (!phaseId)
    return res.status(400).json({ message: "phaseId is required" });

  try {
    const [current] = await pool.query(
      "SELECT t.phaseId, p.label AS oldLabel FROM tasks t LEFT JOIN phases p ON t.phaseId = p.id WHERE t.id = ?",
      [id]
    );
    if (current.length === 0)
      return res.status(404).json({ message: "Task not found" });

    const [newPhase] = await pool.query(
      "SELECT label, isFinal FROM phases WHERE id = ?",
      [phaseId]
    );
    if (newPhase.length === 0)
      return res.status(404).json({ message: "Phase not found" });

    const isFinal     = newPhase[0].isFinal;
    const resolvedEnd = isFinal
      ? (actualEndDate ?? new Date().toISOString().split("T")[0])
      : null;

    await pool.query(
      `UPDATE tasks
       SET phaseId       = ?,
           actualEndDate = CASE WHEN ? = 1 THEN ? ELSE actualEndDate END,
           progress      = CASE WHEN ? = 1 THEN 100 ELSE progress END
       WHERE id = ?`,
      [phaseId, isFinal ? 1 : 0, resolvedEnd, isFinal ? 1 : 0, id]
    );

    const logAction =
      `Phase changed from "${current[0].oldLabel}" to "${newPhase[0].label}"` +
      (isFinal && resolvedEnd ? ` — Actual End Date: ${resolvedEnd}` : "");

    await pool.query(
      "INSERT INTO activity_logs (taskId, action) VALUES (?, ?)",
      [id, logAction]
    );

    const task = await getTaskById(id);
    res.json(task);
  } catch (err) {
    console.error("PATCH /tasks/:id/phase error:", err);
    res.status(500).json({ message: "Failed to update task phase" });
  }
});

// ─── PATCH /api/tasks/:id/subtasks ───────────────────────────────────────────
router.patch("/:id/subtasks", async (req, res) => {
  const { id }       = req.params;
  const { subtasks } = req.body;

  if (!Array.isArray(subtasks))
    return res.status(400).json({ message: "subtasks must be an array" });

  try {
    await pool.query("DELETE FROM subtasks WHERE taskId = ?", [id]);

    for (const s of subtasks) {
      await pool.query(
        "INSERT INTO subtasks (taskId, title, isDone) VALUES (?, ?, ?)",
        [id, s.title, s.isDone ? 1 : 0]
      );
    }

    const total    = subtasks.length;
    const done     = subtasks.filter((s) => s.isDone).length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;

    await pool.query("UPDATE tasks SET progress = ? WHERE id = ?", [progress, id]);

    const task = await getTaskById(id);
    res.json(task);
  } catch (err) {
    console.error("PATCH /tasks/:id/subtasks error:", err);
    res.status(500).json({ message: "Failed to update subtasks" });
  }
});

// ─── PUT /api/tasks/:id ───────────────────────────────────────────────────────
// Full update of task detail fields.
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { title, description, statusId, severityId, assigneeId, targetDate } = req.body;

  try {
    await pool.query(
      `UPDATE tasks
       SET title = ?, description = ?, statusId = ?, severityId = ?, assigneeId = ?, targetDate = ?
       WHERE id = ?`,
      [title, description ?? null, statusId ?? null, severityId ?? null, assigneeId ?? null, targetDate ?? null, id]
    );

    await pool.query(
      "INSERT INTO activity_logs (taskId, action) VALUES (?, ?)",
      [id, "Task details updated"]
    );

    const task = await getTaskById(id);
    res.json(task);
  } catch (err) {
    console.error("PUT /tasks/:id error:", err);
    res.status(500).json({ message: "Failed to update task" });
  }
});

// ─── DELETE /api/tasks/:id ────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM tasks WHERE id = ?", [id]);
    res.json({ message: "Task deleted" });
  } catch (err) {
    console.error("DELETE /tasks/:id error:", err);
    res.status(500).json({ message: "Failed to delete task" });
  }
});

module.exports = router;
