import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState } from 'react';
import type { Lane, Model, OwnerRef, Problem } from '../model/types';
import { isMoveAllowed } from '../model/rules';

function priorityRank(priority: Problem['priority']) {
  switch (priority) {
    case 'P0':
      return 0;
    case 'P1':
      return 1;
    case 'P2':
      return 2;
    case 'P3':
      return 3;
  }
}

function deriveAction(from: OwnerRef, to: OwnerRef): Problem['history'][number]['action'] {
  if (from.type === 'employee' && to.type === 'employee') return 'redirected';
  if (from.type === 'employee' && to.type === 'team') return 'returned';
  if (from.type === 'team' && to.type === 'employee') return 'assigned';
  return 'moved';
}

function laneOwner(lane: Lane): OwnerRef {
  return { type: lane.assigneeType, id: lane.assigneeId };
}

function chipTone(kind: 'priority' | 'status' | 'type', value: string) {
  if (kind === 'priority') {
    switch (value) {
      case 'P0':
        return 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200';
      case 'P1':
        return 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200';
      case 'P2':
        return 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200';
      default:
        return 'border-slate-500/30 bg-slate-500/10 text-slate-800 dark:bg-slate-500/15 dark:text-slate-200';
    }
  }

  if (kind === 'status') {
    switch (value) {
      case 'open':
        return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
      case 'in_progress':
        return 'border-indigo-500/25 bg-indigo-500/10 text-indigo-800 dark:text-indigo-200';
      case 'blocked':
        return 'border-rose-500/25 bg-rose-500/10 text-rose-800 dark:text-rose-200';
      case 'done':
        return 'border-slate-500/25 bg-slate-500/10 text-slate-800 dark:text-slate-200';
      default:
        return 'border-slate-500/25 bg-slate-500/10 text-slate-800 dark:text-slate-200';
    }
  }

  switch (value) {
    case 'team':
      return 'border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200';
    case 'employee':
      return 'border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200';
    default:
      return 'border-slate-500/25 bg-slate-500/10 text-slate-800 dark:text-slate-200';
  }
}

function LaneColumn({
  lane,
  problems,
  isOverHeader,
  isOverBody,
  headerRef,
  bodyRef,
  moveAllHandle
}: {
  lane: Lane;
  problems: Problem[];
  isOverHeader: boolean;
  isOverBody: boolean;
  headerRef: (node: HTMLElement | null) => void;
  bodyRef: (node: HTMLElement | null) => void;
  moveAllHandle: {
    visible: boolean;
    attributes: any;
    listeners: any;
    setNodeRef: (node: HTMLElement | null) => void;
    isDragging: boolean;
  };
}) {
  const isTeamLane = lane.assigneeType === 'team';
  const isOver = isOverHeader || isOverBody;

  return (
    <section
      aria-label={lane.title}
      className={[
        'relative overflow-hidden rounded-3xl border shadow-sm backdrop-blur-xl',
        isTeamLane
          ? 'border-cyan-200/70 bg-gradient-to-br from-cyan-50/60 via-white to-white dark:border-cyan-500/20 dark:from-cyan-950/25 dark:to-white/5'
          : 'border-slate-200/70 bg-white/60',
        'dark:border-white/10 dark:bg-white/5 dark:shadow-black/20',
        'min-h-[62vh] md:min-h-[70vh]',
        isOver ? 'ring-2 ring-indigo-400/40' : 'ring-1 ring-black/5 dark:ring-white/5'
      ].join(' ')}
    >
      {isTeamLane ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500/55 via-indigo-500/45 to-fuchsia-500/45 dark:from-cyan-400/35 dark:via-indigo-400/25 dark:to-fuchsia-400/25" />
      ) : null}

      <div
        ref={headerRef}
        className={[
          'flex items-baseline justify-between gap-3 border-b px-5 py-4',
          isTeamLane
            ? 'border-cyan-200/70 dark:border-cyan-500/20'
            : 'border-slate-200/70 dark:border-white/10',
          isOverHeader ? 'bg-indigo-500/5 dark:bg-white/5' : ''
        ].join(' ')}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{lane.title}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span
              className={[
                'inline-flex items-center rounded-full border px-2 py-0.5',
                chipTone('type', lane.assigneeType)
              ].join(' ')}
            >
              {lane.assigneeType}
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600 dark:text-slate-300">{problems.length} items</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {moveAllHandle.visible ? (
            <button
              ref={moveAllHandle.setNodeRef}
              type="button"
              className={[
                'rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                'border-slate-200/70 bg-white/60 text-slate-800 shadow-sm backdrop-blur hover:bg-white/80',
                'dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10',
                moveAllHandle.isDragging ? 'opacity-60' : ''
              ].join(' ')}
              title="Drag to move ALL problems in this lane"
              {...moveAllHandle.listeners}
              {...moveAllHandle.attributes}
            >
              Move all
            </button>
          ) : null}

          <div className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
            {problems.length}
          </div>
        </div>
      </div>

      <div ref={bodyRef} className={['flex flex-col gap-3 p-5', isOverBody ? 'bg-indigo-500/5 dark:bg-white/5' : ''].join(' ')}>
        <div className="rounded-2xl border border-slate-200/70 bg-white/50 px-3 py-2 text-xs text-slate-600 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
          Drop on header or here
        </div>
        {problems.map((p) => (
          <ProblemCard key={p.id} problem={p} />
        ))}
      </div>
    </section>
  );
}

function DroppableLane({ lane, problems }: { lane: Lane; problems: Problem[] }) {
  const { setNodeRef: headerRef, isOver: isOverHeader } = useDroppable({
    id: `${lane.id}::header`
  });
  const { setNodeRef: bodyRef, isOver: isOverBody } = useDroppable({ id: `${lane.id}::body` });

  const moveAllDragId = `lane::${lane.id}`;
  const moveAllEnabled = lane.assigneeType === 'employee' || lane.assigneeType === 'team';
  const {
    attributes: moveAllAttributes,
    listeners: moveAllListeners,
    setNodeRef: moveAllRef,
    isDragging: isMoveAllDragging
  } = useDraggable({
    id: moveAllDragId,
    disabled: !moveAllEnabled
  });

  return (
    <LaneColumn
      lane={lane}
      problems={problems}
      isOverHeader={isOverHeader}
      isOverBody={isOverBody}
      headerRef={headerRef}
      bodyRef={bodyRef}
      moveAllHandle={{
        visible: moveAllEnabled,
        attributes: (moveAllAttributes ?? {}) as unknown as Record<string, unknown>,
        listeners: (moveAllListeners ?? {}) as unknown as Record<string, unknown>,
        setNodeRef: moveAllRef,
        isDragging: isMoveAllDragging
      }}
    />
  );
}

function ProblemCard({ problem }: { problem: Problem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: problem.id
  });

  const style: import('react').CSSProperties = {
    transform: CSS.Translate.toString(transform)
  };

  return (
    <article
      ref={setNodeRef}
      className={[
        'rounded-2xl border border-slate-200/70 bg-white/80 p-3 text-left shadow-sm backdrop-blur',
        'dark:border-white/10 dark:bg-white/5 dark:shadow-black/20',
        'cursor-grab active:cursor-grabbing',
        'transition-colors hover:bg-white hover:border-slate-300 hover:shadow-md dark:hover:bg-white/10 dark:hover:border-white/15',
        isDragging ? 'opacity-40' : ''
      ].join(' ')}
      style={style}
      {...listeners}
      {...attributes}
    >
      <div className="text-sm font-semibold leading-snug text-slate-900 dark:text-white">{problem.title}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={[
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]',
            chipTone('priority', problem.priority)
          ].join(' ')}
        >
          {problem.priority}
        </span>
        <span
          className={[
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]',
            chipTone('status', problem.status)
          ].join(' ')}
        >
          {problem.status}
        </span>
      </div>
      {problem.tags.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {problem.tags.map((t) => (
            <span
              className="rounded-full border border-slate-200/70 bg-slate-50/70 px-2 py-0.5 text-[11px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
              key={t}
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function Board({ model }: { model: Model }) {
  const [problems, setProblems] = useState<Problem[]>(model.problems);
  const [activeProblemId, setActiveProblemId] = useState<string | null>(null);
  const [activeLaneDragId, setActiveLaneDragId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const board = model.boards[0];
  const lanes = board.lanes;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    })
  );

  const problemsByLane = useMemo(() => {
    const map = new Map<string, Problem[]>();
    for (const lane of lanes) map.set(lane.id, []);
    for (const p of problems) {
      const list = map.get(p.currentLaneId);
      if (list) list.push(p);
    }
    for (const [laneId, list] of map.entries()) {
      list.sort((a, b) => {
        const pr = priorityRank(a.priority) - priorityRank(b.priority);
        if (pr !== 0) return pr;
        return a.title.localeCompare(b.title);
      });
      map.set(laneId, list);
    }
    return map;
  }, [problems, lanes]);

  const activeProblem = useMemo(
    () => problems.find((p) => p.id === activeProblemId) ?? null,
    [activeProblemId, problems]
  );

  const activeLane = useMemo(() => {
    if (!activeLaneDragId) return null;
    const laneId = activeLaneDragId.replace(/^lane::/, '');
    return lanes.find((l) => l.id === laneId) ?? null;
  }, [activeLaneDragId, lanes]);

  function clearMessageSoon() {
    window.setTimeout(() => setMessage(null), 2500);
  }

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (id.startsWith('lane::')) {
      setActiveLaneDragId(id);
      setActiveProblemId(null);
      return;
    }

    setActiveProblemId(id);
    setActiveLaneDragId(null);
  }

  function onDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    setActiveProblemId(null);
    setActiveLaneDragId(null);

    const overId = event.over?.id;
    if (!overId) return;

    const overKey = String(overId);

    function destLaneIdFromOverKey(key: string): string | null {
      if (key.includes('::')) return key.split('::')[0] ?? null;
      // If dropping over a problem card, route to that problem's lane.
      const p = problems.find((x) => x.id === key);
      return p?.currentLaneId ?? null;
    }

    const destLaneId = destLaneIdFromOverKey(overKey);
    if (!destLaneId) return;

    // Bulk move: drag employee lane header "Move all" handle to another lane.
    if (activeId.startsWith('lane::')) {
      const srcLaneId = activeId.replace(/^lane::/, '');
      if (srcLaneId === destLaneId) return;

      const srcLane = lanes.find((l) => l.id === srcLaneId);
      const destLane = lanes.find((l) => l.id === destLaneId);
      if (!srcLane || !destLane) return;

      const fromOwner = laneOwner(srcLane);
      const toOwner = laneOwner(destLane);

      const ok = isMoveAllowed(model.allowedMoves, fromOwner.type, toOwner.type);
      if (!ok) {
        setMessage(`Move not allowed: ${fromOwner.type} → ${toOwner.type}`);
        clearMessageSoon();
        return;
      }

      const now = new Date().toISOString();
      const action = deriveAction(fromOwner, toOwner);

      setProblems((prev) => {
        const srcCount = prev.filter((p) => p.currentLaneId === srcLaneId).length;
        if (srcCount === 0) return prev;

        setMessage(`Moved ${srcCount} problems`);
        clearMessageSoon();

        return prev.map((p) => {
          if (p.currentLaneId !== srcLaneId) return p;
          return {
            ...p,
            owner: toOwner,
            currentLaneId: destLaneId,
            history: [
              ...p.history,
              {
                at: now,
                action,
                by: model.org.team.managerId,
                from: fromOwner,
                to: toOwner
              }
            ]
          };
        });
      });
      return;
    }

    const problemId = activeId;

    setProblems((prev) => {
      const idx = prev.findIndex((p) => p.id === problemId);
      if (idx < 0) return prev;

      const current = prev[idx];
      if (current.currentLaneId === destLaneId) return prev;

      const destLane = lanes.find((l) => l.id === destLaneId);
      if (!destLane) return prev;

      const fromOwner = current.owner;
      const toOwner: OwnerRef = { type: destLane.assigneeType, id: destLane.assigneeId };

      const ok = isMoveAllowed(model.allowedMoves, fromOwner.type, toOwner.type);
      if (!ok) {
        setMessage(`Move not allowed: ${fromOwner.type} → ${toOwner.type}`);
        clearMessageSoon();
        return prev;
      }

      const now = new Date().toISOString();
      const action = deriveAction(fromOwner, toOwner);

      const updated: Problem = {
        ...current,
        owner: toOwner,
        currentLaneId: destLaneId,
        history: [
          ...current.history,
          {
            at: now,
            action,
            by: model.org.team.managerId,
            from: fromOwner,
            to: toOwner
          }
        ]
      };

      const next = prev.slice();
      next[idx] = updated;
      return next;
    });
  }

  return (
    <>
      {message ? (
        <div className="mb-4 rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:shadow-black/20">
          {message}
        </div>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="list">
          {lanes.map((lane) => (
            <DroppableLane
              key={lane.id}
              lane={lane}
              problems={problemsByLane.get(lane.id) ?? []}
            />
          ))}
        </div>

        <DragOverlay>
          {activeProblem ? (
            <div
              className="rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-white/10 dark:shadow-black/30"
              style={{ cursor: 'grabbing' }}
            >
              <div className="text-sm font-semibold leading-snug text-slate-900 dark:text-white">
                {activeProblem.title}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span
                  className={[
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]',
                    chipTone('priority', activeProblem.priority)
                  ].join(' ')}
                >
                  {activeProblem.priority}
                </span>
                <span
                  className={[
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]',
                    chipTone('status', activeProblem.status)
                  ].join(' ')}
                >
                  {activeProblem.status}
                </span>
              </div>
            </div>
          ) : activeLane ? (
            <div
              className="rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-900 shadow-lg backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
              style={{ cursor: 'grabbing' }}
            >
              Move all from: {activeLane.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
