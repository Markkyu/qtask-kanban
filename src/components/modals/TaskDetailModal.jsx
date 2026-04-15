import { useState } from "react";
import {
  uid,
  SEVERITY_COLORS,
  calcProgressFromSubtasks,
  formatShortDate,
} from "../../utils/kanbanUtils";
import { Trash2 } from "lucide-react";
import FileUpload from "../ui/FileUpload";

function normaliseSubtasks(subtasks) {
  return (subtasks ?? []).map((s) => ({
    ...s,
    isDone: Boolean(s.isDone ?? s.done ?? false),
  }));
}

/**
 * TaskDetailModal
 *
 * After the phase/status swap:
 *   - "Phase" (phaseLabel) shows which Kanban column the task is currently in.
 *     The phase is changed by dragging the card on the board, NOT here.
 *   - "Status" (statusLabel) is the secondary workflow attribute (e.g.
 *     Open, For Verification, Closed). This IS editable here.
 *   - The edit form lets the PM update: Assignee, Severity, Status, Target date.
 *
 * Props:
 *   task       — task object from the DB
 *   users      — [{ id, name, role }]
 *   severities — [{ id, label }]
 *   statuses   — [{ id, label }]  ← workflow statuses (NOT Kanban columns)
 *   onUpdate   — fn(taskId, { subtasks })
 *   onEdit     — fn(taskId, payload)
 *   onDelete   — fn(taskId)
 *   onClose    — fn()
 */
export default function TaskDetailModal({
  task,
  users      = [],
  severities = [],
  statuses   = [],
  onUpdate,
  onEdit,
  onDelete,
  onClose,
}) {
  const [localSubtasks,    setLocalSubtasks]    = useState(() => normaliseSubtasks(task.subtasks));
  const [newSubtaskTitle,  setNewSubtaskTitle]  = useState("");
  const [editMode,         setEditMode]         = useState(false);
  const [editForm,         setEditForm]         = useState({
    assigneeId: task.assigneeId ?? "",
    severityId: task.severityId ?? "",
    statusId:   task.statusId   ?? "",   // workflow status — editable
    targetDate: task.targetDate ? task.targetDate.split("T")[0] : "",
  });
  const [saving,           setSaving]           = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting,         setDeleting]         = useState(false);

  const doneCount = localSubtasks.filter((s) => s.isDone).length;
  const progress  = calcProgressFromSubtasks(localSubtasks) ?? task.progress ?? 0;
  const sc =
    SEVERITY_COLORS[task.severity] ??
    SEVERITY_COLORS[task.severityLabel] ??
    SEVERITY_COLORS.Low;

  const setField = (k, v) => setEditForm((prev) => ({ ...prev, [k]: v }));

  // ── Edit save ─────────────────────────────────────────────
  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await onEdit(task.id, {
        title:       task.title,
        description: task.description,
        assigneeId:  editForm.assigneeId ? Number(editForm.assigneeId) : null,
        severityId:  editForm.severityId ? Number(editForm.severityId) : null,
        statusId:    editForm.statusId   ? Number(editForm.statusId)   : null,
        targetDate:  editForm.targetDate || null,
      });
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  // ── Subtask handlers ──────────────────────────────────────
  const handleToggleSubtask = (subtaskId) => {
    setLocalSubtasks((prev) => {
      const updated = prev.map((s) =>
        s.id === subtaskId ? { ...s, isDone: !s.isDone } : s
      );
      onUpdate(task.id, { subtasks: updated });
      return updated;
    });
  };

  const handleAddSubtask = (e) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    setLocalSubtasks((prev) => {
      const updated = [...prev, { id: uid(), title: newSubtaskTitle.trim(), isDone: false }];
      onUpdate(task.id, { subtasks: updated });
      return updated;
    });
    setNewSubtaskTitle("");
  };

  const handleDeleteSubtask = (subtaskId) => {
    setLocalSubtasks((prev) => {
      const updated = prev.filter((s) => s.id !== subtaskId);
      onUpdate(task.id, { subtasks: updated });
      return updated;
    });
  };

  const handleDeleteTask = async () => {
    setDeleting(true);
    try {
      await onDelete(task.id);
    } catch {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-16 overflow-y-auto"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mb-16">

        {/* ── 1. Header ── */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            {(task.severity || task.severityLabel) && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ color: sc.text, background: sc.bg }}
              >
                {task.severity ?? task.severityLabel}
              </span>
            )}
            <h2 className="text-lg font-semibold text-gray-800 leading-snug">
              {task.title ?? task.name}
            </h2>
          </div>

          <div className="flex items-center gap-2 ml-4 shrink-0">
            {!editMode ? (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 px-2.5 py-1.5 rounded-lg transition"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 2l3 3-8 8H3v-3l8-8z"/>
                </svg>
                Edit
              </button>
            ) : (
              <button type="button" onClick={() => setEditMode(false)}
                className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg transition">
                Cancel
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {/* ── 2. Details ── */}
        <div className="p-6 space-y-4 border-b border-gray-100">
          {task.description && !editMode && (
            <p className="text-sm text-gray-600 leading-relaxed">{task.description}</p>
          )}

          {!editMode ? (
            /* VIEW mode */
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Assignee</p>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-[10px]">
                    {(task.assigneeName ?? task.assignee)?.charAt(0)?.toUpperCase() ?? "?"}
                  </span>
                  <span className="text-sm text-gray-700">
                    {task.assigneeName ?? task.assignee ?? "Unassigned"}
                  </span>
                </div>
              </div>

              <div className="space-y-0.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Severity</p>
                <p className="text-sm text-gray-700">{task.severityLabel ?? task.severity ?? "—"}</p>
              </div>

              <div className="space-y-0.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Target date</p>
                <p className="text-sm text-gray-700">{formatShortDate(task.targetDate) ?? "—"}</p>
              </div>

              {/* Phase = which Kanban column the card is in — read-only here */}
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Phase (column)</p>
                <span className="inline-block text-sm font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                  {task.phaseLabel ?? "—"}
                </span>
              </div>

              {/* Status = workflow attribute, editable */}
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Status</p>
                <span className="inline-block text-sm font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  {task.statusLabel ?? "—"}
                </span>
              </div>

              {task.actualEndDate && (
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Actual end date</p>
                  <p className="text-sm text-gray-700">{formatShortDate(task.actualEndDate)}</p>
                </div>
              )}
            </div>
          ) : (
            /* EDIT mode */
            <div className="space-y-3">
              <p className="text-xs text-blue-600 font-medium">
                Editing assignee, severity, status and target date
              </p>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Assignee</label>
                <select value={editForm.assigneeId} onChange={(e) => setField("assigneeId", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white">
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Severity</label>
                <select value={editForm.severityId} onChange={(e) => setField("severityId", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white">
                  <option value="">None</option>
                  {severities.map((sv) => (
                    <option key={sv.id} value={sv.id}>{sv.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Status (workflow)
                </label>
                <select value={editForm.statusId} onChange={(e) => setField("statusId", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white">
                  <option value="">— None —</option>
                  {statuses.map((st) => (
                    <option key={st.id} value={st.id}>{st.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Target date</label>
                <input type="date" value={editForm.targetDate} onChange={(e) => setField("targetDate", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setEditMode(false)} disabled={saving}
                  className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveEdit} disabled={saving}
                  className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          )}

          {/* ── 3. Progress bar ── */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Progress</p>
              <span className="text-xs font-semibold text-blue-600">{progress}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, background: progress === 100 ? "#10b981" : "#3b82f6" }}
              />
            </div>
            {localSubtasks.length > 0 && (
              <p className="text-xs text-gray-400">
                {doneCount} of {localSubtasks.length} subtask{localSubtasks.length !== 1 ? "s" : ""} completed
              </p>
            )}
          </div>
        </div>

        {/* ── 4. Subtasks ── */}
        <div className="p-6 space-y-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Subtasks</h3>
          {localSubtasks.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No subtasks yet. Add one below to start tracking progress.</p>
          ) : (
            <ul className="space-y-2">
              {localSubtasks.map((subtask) => (
                <li key={subtask.id} className="flex items-center gap-3 group">
                  <button type="button" onClick={() => handleToggleSubtask(subtask.id)}
                    className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                      subtask.isDone ? "bg-emerald-500 border-emerald-500" : "border-gray-300 hover:border-blue-400"
                    }`}>
                    {subtask.isDone && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                  <span className={`flex-1 text-sm transition-colors ${subtask.isDone ? "line-through text-gray-400" : "text-gray-700"}`}>
                    {subtask.title}
                  </span>
                  <button type="button" onClick={() => handleDeleteSubtask(subtask.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-sm leading-none shrink-0 cursor-pointer">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleAddSubtask} className="flex gap-2 pt-1">
            <input value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)}
              placeholder="Add a subtask…"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 placeholder-gray-400"
            />
            <button type="submit" disabled={!newSubtaskTitle.trim()}
              className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
              Add
            </button>
          </form>
        </div>

        {/* ── 5. Attachments ── */}
        <div className="border-b border-gray-100">
          <FileUpload taskId={task.id} />
        </div>

        {/* ── 6. Footer: delete ── */}
        <div className="px-6 py-4">
          {!confirmingDelete ? (
            <button type="button" onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-red-500 transition-colors cursor-pointer">
              <Trash2 size={16} />
              Delete this task
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-red-400 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 3.5v3m0 2h.01"/>
              </svg>
              <span className="flex-1 text-sm text-red-700">
                Delete <strong>{task.title}</strong>? This cannot be undone.
              </span>
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}
                className="text-sm text-gray-500 hover:text-gray-700 transition cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={handleDeleteTask} disabled={deleting}
                className="px-3 py-1.5 text-sm font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 shrink-0 cursor-pointer">
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
