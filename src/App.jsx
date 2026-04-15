import { useState, useCallback, useEffect } from "react";

import KanbanBoard     from "./components/board/KanbanBoard";
import DoneModal       from "./components/modals/DoneModal";
import AddTaskModal    from "./components/modals/AddTaskModal";
import AddColumnModal  from "./components/modals/AddColumnModal";
import TaskDetailModal from "./components/modals/TaskDetailModal";

import {
  fetchPhases,
  fetchStatuses,
  fetchSeverities,
  fetchTasks,
  fetchUsers,
  createPhase,
  moveTask,
  createTask,
  updateTask,
  deleteTask,
  updateSubtasks,
} from "./services/api";

export default function App() {
  // phases drive the Kanban columns
  const [phases,      setPhases]      = useState([]);
  // statuses are a secondary task attribute shown in detail view
  const [statuses,    setStatuses]    = useState([]);
  const [severities,  setSeverities]  = useState([]);
  const [tasks,       setTasks]       = useState([]);
  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [renderKey,   setRenderKey]   = useState(0);
  const [doneModal,   setDoneModal]   = useState(null);   // { taskId, targetPhaseId }
  const [showAddTask,   setShowAddTask]   = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [detailTask,    setDetailTask]    = useState(null);

  // ── Load on mount ─────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [phaseData, statusData, severityData, taskData, userData] =
          await Promise.all([
            fetchPhases(),
            fetchStatuses(),
            fetchSeverities(),
            fetchTasks(),
            fetchUsers(),
          ]);
        setPhases(phaseData);
        setStatuses(statusData);
        setSeverities(severityData);
        setTasks(taskData);
        setUsers(userData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Derived: group tasks by phaseId for the board ─────────
  const tasksByPhase = phases.reduce((acc, p) => {
    acc[p.id] = tasks.filter((t) => t.phaseId === p.id);
    return acc;
  }, {});

  const findTask = useCallback(
    (taskId) => tasks.find((t) => t.id === taskId),
    [tasks]
  );

  // ── Drag end — fromPhaseId / toPhaseId ────────────────────
  const handleDragEnd = useCallback(
    async (fromPhaseId, toPhaseId, taskId) => {
      if (fromPhaseId === toPhaseId) return;
      const targetPhase = phases.find((p) => p.id === toPhaseId);

      if (targetPhase?.isFinal) {
        // Show Done confirmation modal before committing
        setDoneModal({ taskId, targetPhaseId: toPhaseId });
      } else {
        try {
          // Optimistic update
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? { ...t, phaseId: toPhaseId, phaseLabel: targetPhase?.label }
                : t
            )
          );
          setRenderKey((k) => k + 1);
          await moveTask(taskId, toPhaseId);
        } catch (err) {
          console.error("Move failed:", err.message);
          // Rollback
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, phaseId: fromPhaseId } : t))
          );
          setRenderKey((k) => k + 1);
          alert(`Move failed: ${err.message}`);
        }
      }
    },
    [phases]
  );

  // ── Done modal confirm ────────────────────────────────────
  const handleDoneConfirm = useCallback(
    async (actualEndDate) => {
      if (!doneModal) return;
      const { taskId, targetPhaseId } = doneModal;
      const targetPhase = phases.find((p) => p.id === targetPhaseId);
      try {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  phaseId:       targetPhaseId,
                  phaseLabel:    targetPhase?.label,
                  actualEndDate,
                  progress:      100,
                }
              : t
          )
        );
        setRenderKey((k) => k + 1);
        const updated = await moveTask(taskId, targetPhaseId, actualEndDate);
        setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      } catch (err) {
        console.error("Done confirm failed:", err.message);
        alert(`Failed to mark done: ${err.message}`);
      } finally {
        setDoneModal(null);
      }
    },
    [doneModal, phases]
  );

  // ── Add task ──────────────────────────────────────────────
  const handleAddTask = useCallback(async (formData) => {
    try {
      const newTask = await createTask(formData);
      setTasks((prev) => [newTask, ...prev]);
      setShowAddTask(false);
      setRenderKey((k) => k + 1);
    } catch (err) {
      console.error("Create task failed:", err.message);
      alert(`Failed to create task: ${err.message}`);
    }
  }, []);

  // ── Add column (phase) ────────────────────────────────────
  const handleAddColumn = useCallback(
    async ({ label, isFinal, isDefault }) => {
      const maxOrder = phases.reduce(
        (max, p) => Math.max(max, p.sortOrder ?? 0),
        0
      );
      const saved = await createPhase({
        label,
        isFinal:   isFinal   ? 1 : 0,
        isDefault: isDefault ? 1 : 0,
        sortOrder: maxOrder + 1,
      });
      setPhases((prev) => [...prev, saved]);
      setShowAddColumn(false);
      setRenderKey((k) => k + 1);
    },
    [phases]
  );

  // ── Edit task fields ──────────────────────────────────────
  const handleEditTask = useCallback(async (taskId, payload) => {
    try {
      const updated = await updateTask(taskId, payload);
      setTasks((prev)     => prev.map((t) => (t.id === taskId ? updated : t)));
      setDetailTask((prev) => (prev?.id === taskId ? updated : prev));
    } catch (err) {
      console.error("Edit task failed:", err.message);
      throw err;
    }
  }, []);

  // ── Delete task ───────────────────────────────────────────
  const handleDeleteTask = useCallback(async (taskId) => {
    try {
      await deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setDetailTask(null);
      setRenderKey((k) => k + 1);
    } catch (err) {
      console.error("Delete task failed:", err.message);
      throw err;
    }
  }, []);

  // ── Card click ────────────────────────────────────────────
  const handleCardClick = useCallback((task) => {
    setDetailTask(task);
  }, []);

  // ── Subtask update ────────────────────────────────────────
  const handleUpdateSubtasks = useCallback(async (taskId, newSubtasks) => {
    try {
      const updated = await updateSubtasks(taskId, newSubtasks);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      console.error("Subtask update failed:", err.message);
    }
  }, []);

  const totalTasks = tasks.length;
  const doneTask   = doneModal ? findTask(doneModal.taskId) : null;

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading board…</p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-6 max-w-sm text-center space-y-3">
          <p className="text-red-500 font-semibold">Could not connect to the server</p>
          <p className="text-sm text-gray-500">{error}</p>
          <p className="text-xs text-gray-400">
            Make sure the Express backend is running on{" "}
            <code className="bg-gray-100 px-1 rounded">localhost:5000</code>
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Kanban Board</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalTasks} task{totalTasks !== 1 ? "s" : ""} across {phases.length} phases
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddColumn(true)}
            className="bg-gray-700 text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition text-sm shadow"
          >
            + Add phase
          </button>
          <button
            onClick={() => setShowAddTask(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition text-sm shadow"
          >
            + Add task
          </button>
        </div>
      </div>

      {/* Board — columns = phases, tasks grouped by phaseId */}
      <KanbanBoard
        columns={phases}
        tasks={tasksByPhase}
        renderKey={renderKey}
        onDragEnd={handleDragEnd}
        onCardClick={handleCardClick}
      />

      {/* Task detail / edit modal */}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          users={users}
          severities={severities}
          statuses={statuses}
          onUpdate={(taskId, fields) => {
            if (fields.subtasks !== undefined) {
              handleUpdateSubtasks(taskId, fields.subtasks);
            }
          }}
          onEdit={handleEditTask}
          onDelete={handleDeleteTask}
          onClose={() => setDetailTask(null)}
        />
      )}

      {/* Done modal — fires when card is dropped on an isFinal phase */}
      {doneModal && doneTask && (
        <DoneModal
          taskName={doneTask.title}
          onConfirm={handleDoneConfirm}
          onCancel={() => setDoneModal(null)}
        />
      )}

      {/* Add task modal */}
      {showAddTask && (
        <AddTaskModal
          onAdd={handleAddTask}
          onClose={() => setShowAddTask(false)}
          users={users}
          phases={phases}
          severities={severities}
        />
      )}

      {/* Add phase/column modal */}
      {showAddColumn && (
        <AddColumnModal
          onAdd={handleAddColumn}
          onClose={() => setShowAddColumn(false)}
        />
      )}
    </div>
  );
}
