import { useEffect, useRef, useState } from "react";
import Sortable from "sortablejs";
import KanbanColumn from "./KanbanColumn";

/**
 * KanbanBoard
 * Columns are now phases (p.id from the phases table).
 * data-col on each droppable container holds the phase id.
 * onDragEnd receives (fromPhaseId, toPhaseId, taskId).
 */
export default function KanbanBoard({ columns, tasks, renderKey, onDragEnd, onCardClick }) {
  const colRefs      = useRef({});
  const sortablesRef = useRef({});
  const scrollRef    = useRef(null);

  const [showLeftFade,  setShowLeftFade]  = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateFades = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 8);
    setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  };

  useEffect(() => { updateFades(); }, [renderKey, columns]);

  useEffect(() => {
    columns.forEach(({ id }) => {
      const el = colRefs.current[id];
      if (!el || sortablesRef.current[id]) return;

      sortablesRef.current[id] = Sortable.create(el, {
        group:       "kanban",
        animation:   150,
        ghostClass:  "sortable-ghost",
        chosenClass: "sortable-chosen",
        onEnd(evt) {
          const { from, to, oldIndex } = evt;

          // data-col holds the numeric phase id
          const fromPhaseId = Number(from.dataset.col);
          const toPhaseId   = Number(to.dataset.col);
          const taskId      = Number(evt.item.dataset.id);

          // Revert DOM — React + server are source of truth
          if (fromPhaseId === toPhaseId) {
            from.insertBefore(evt.item, from.children[oldIndex] || null);
          } else {
            to.removeChild(evt.item);
            from.insertBefore(evt.item, from.children[oldIndex] || null);
          }

          onDragEnd(fromPhaseId, toPhaseId, taskId);
        },
      });
    });

    return () => {
      Object.values(sortablesRef.current).forEach((s) => s.destroy());
      sortablesRef.current = {};
    };
  }, [renderKey, columns, onDragEnd]);

  return (
    <>
      <style>{`
        .sortable-ghost  { opacity: 0.3; }
        .sortable-chosen { box-shadow: 0 0 0 2px #3b82f6, 0 4px 16px rgba(59,130,246,.2); }
        .kanban-scroll::-webkit-scrollbar       { height: 6px; }
        .kanban-scroll::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
        .kanban-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
        .kanban-scroll::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      `}</style>

      <div className="relative">
        {showLeftFade && (
          <div
            className="absolute left-0 top-0 bottom-6 w-16 z-10 pointer-events-none"
            style={{ background: "linear-gradient(to right, #f9fafb, transparent)" }}
          />
        )}
        {showRightFade && (
          <div
            className="absolute right-0 top-0 bottom-6 w-16 z-10 pointer-events-none"
            style={{ background: "linear-gradient(to left, #f9fafb, transparent)" }}
          />
        )}

        <div
          key={renderKey}
          ref={scrollRef}
          onScroll={updateFades}
          className="kanban-scroll flex gap-3 items-start overflow-x-auto pb-3"
        >
          {columns.map((col) => (
            <KanbanColumn
              key={col.id}
              col={col}
              tasks={tasks[col.id] ?? []}
              colRef={(el) => (colRefs.current[col.id] = el)}
              onCardClick={onCardClick}
            />
          ))}
          <div className="shrink-0 w-4" aria-hidden />
        </div>
      </div>
    </>
  );
}
