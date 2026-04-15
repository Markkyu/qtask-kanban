const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pool = require("../config/db");

const router = express.Router();

// ── Allowed extensions and size limit (SRS §6.1) ─────────────────────────────
const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp", // images
  ".pdf", // documents
  ".xlsx",
  ".xls",
  ".csv", // spreadsheets
  ".doc",
  ".docx", // word docs
  ".txt", // plain text
  ".zip", // archives — block .exe etc.
]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB  (SRS §6.1)

// ── Multer storage — files saved to backend/uploads/<taskId>/ ────────────────
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(__dirname, "../uploads", String(req.params.taskId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    // Prefix with timestamp to avoid name collisions
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, safeName);
  },
});

// ── Multer file filter — extension check (SRS §6.1) ─────────────────────────
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      new Error(
        `Upload failed: File must be under 10MB and be a valid document/image type. ` +
          `"${ext}" files are not allowed.`,
      ),
      false,
    );
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
});

// ── Error handler for multer ──────────────────────────────────────────────────
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message:
          "Upload failed: File must be under 10MB and be a valid document/image type.",
      });
    }
  }
  if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
}

// ── GET /api/attachments/:taskId ─────────────────────────────────────────────
// Returns all attachment metadata for a task.
router.get("/:taskId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM task_attachments WHERE taskId = ? ORDER BY uploadedAt DESC",
      [req.params.taskId],
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /attachments/:taskId error:", err);
    res.status(500).json({ message: "Failed to fetch attachments" });
  }
});

// ── POST /api/attachments/:taskId ────────────────────────────────────────────
// Uploads a file and records its metadata in the DB.
router.post(
  "/:taskId",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next);
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file received." });
    }

    const { taskId } = req.params;
    const { originalname, filename, mimetype, size } = req.file;

    try {
      const [result] = await pool.query(
        `INSERT INTO task_attachments
           (taskId, originalName, storedName, mimeType, sizeBytes)
         VALUES (?, ?, ?, ?, ?)`,
        [taskId, originalname, filename, mimetype, size],
      );

      const [rows] = await pool.query(
        "SELECT * FROM task_attachments WHERE id = ?",
        [result.insertId],
      );

      // Log to audit trail
      await pool.query(
        "INSERT INTO activity_logs (taskId, action) VALUES (?, ?)",
        [taskId, `File uploaded: ${originalname}`],
      );

      res.status(201).json(rows[0]);
    } catch (err) {
      // Clean up the saved file if the DB insert fails
      fs.unlink(req.file.path, () => {});
      console.error("POST /attachments/:taskId error:", err);
      res.status(500).json({ message: "Failed to save attachment metadata." });
    }
  },
);

// ── GET /api/attachments/:taskId/:attachmentId/download ──────────────────────
// Streams the file to the client as a download.
router.get("/:taskId/:attachmentId/download", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM task_attachments WHERE id = ? AND taskId = ?",
      [req.params.attachmentId, req.params.taskId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Attachment not found." });
    }

    const attachment = rows[0];
    const filePath = path.join(
      __dirname,
      "../uploads",
      String(req.params.taskId),
      attachment.storedName,
    );

    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ message: "File no longer exists on disk." });
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.originalName}"`,
    );
    res.setHeader("Content-Type", attachment.mimeType);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("GET /attachments/download error:", err);
    res.status(500).json({ message: "Failed to download file." });
  }
});

// ── DELETE /api/attachments/:taskId/:attachmentId ────────────────────────────
// Removes the file from disk and deletes the DB record.
router.delete("/:taskId/:attachmentId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM task_attachments WHERE id = ? AND taskId = ?",
      [req.params.attachmentId, req.params.taskId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Attachment not found." });
    }

    const attachment = rows[0];
    const filePath = path.join(
      __dirname,
      "../uploads",
      String(req.params.taskId),
      attachment.storedName,
    );

    // Delete from DB first
    await pool.query("DELETE FROM task_attachments WHERE id = ?", [
      req.params.attachmentId,
    ]);

    // Then remove from disk (don't fail if file is already missing)
    fs.unlink(filePath, () => {});

    // Audit log
    await pool.query(
      "INSERT INTO activity_logs (taskId, action) VALUES (?, ?)",
      [req.params.taskId, `File deleted: ${attachment.originalName}`],
    );

    res.json({ message: "Attachment deleted." });
  } catch (err) {
    console.error("DELETE /attachments error:", err);
    res.status(500).json({ message: "Failed to delete attachment." });
  }
});

module.exports = router;
