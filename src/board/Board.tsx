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
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Lane, Model, OwnerRef, Problem } from '../model/types';
import { isMoveAllowed } from '../model/rules';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function formatAgeFromMs(deltaMs: number): string {
  const safeMs = Math.max(0, deltaMs);
  const totalMinutes = Math.floor(safeMs / (1000 * 60));
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const totalDays = Math.floor(totalHours / 24);

  // Calendar-accurate months/years require a start timestamp. For UX, use a simple breakdown.
  const years = Math.floor(totalDays / 365);
  const daysAfterYears = totalDays % 365;
  const months = Math.floor(daysAfterYears / 30);
  const days = daysAfterYears % 30;

  const parts: string[] = [];
  if (years) parts.push(`${years}y`);
  if (months) parts.push(`${months}mo`);
  if (days) parts.push(`${days}d`);
  parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function formatOpenedInfo(problem: Problem): { openedLine: string; ageHoursLine: string } | null {
  const epoch = problem.openedAtEpochSeconds;
  const openedDate = typeof epoch === 'number' ? new Date(epoch * 1000) : null;
  if (!openedDate || Number.isNaN(openedDate.getTime())) return null;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const openedText = `${pad2(openedDate.getDate())}/${pad2(openedDate.getMonth() + 1)}/${openedDate.getFullYear()} ${pad2(openedDate.getHours())}:${pad2(openedDate.getMinutes())}`;

  const ageText = formatAgeFromMs(Date.now() - openedDate.getTime());
  const openedLine = `Opened: ${openedText}`;
  const ageHoursLine = `Age: ${ageText} since open`;
  return { openedLine, ageHoursLine };
}

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

function openedEpochForSort(p: Problem): number {
  // Oldest first. Missing dates go to bottom.
  return typeof p.openedAtEpochSeconds === 'number' ? p.openedAtEpochSeconds : Number.POSITIVE_INFINITY;
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

type LanePalette = {
  border: string;
  bg: string;
  accent: string;
  headerBorder: string;
};

const employeeLanePalettes: LanePalette[] = [
  {
    border: 'border-emerald-200/70 dark:border-emerald-500/20',
    bg: 'bg-gradient-to-br from-emerald-50/60 via-white to-white dark:from-emerald-950/25 dark:to-white/5',
    accent: 'from-emerald-500/45 via-teal-500/35 to-sky-500/35 dark:from-emerald-400/25 dark:via-teal-400/20 dark:to-sky-400/20',
    headerBorder: 'border-emerald-200/70 dark:border-emerald-500/20'
  },
  {
    border: 'border-violet-200/70 dark:border-violet-500/20',
    bg: 'bg-gradient-to-br from-violet-50/60 via-white to-white dark:from-violet-950/25 dark:to-white/5',
    accent: 'from-violet-500/45 via-fuchsia-500/35 to-indigo-500/35 dark:from-violet-400/25 dark:via-fuchsia-400/20 dark:to-indigo-400/20',
    headerBorder: 'border-violet-200/70 dark:border-violet-500/20'
  },
  {
    border: 'border-amber-200/70 dark:border-amber-500/20',
    bg: 'bg-gradient-to-br from-amber-50/60 via-white to-white dark:from-amber-950/25 dark:to-white/5',
    accent: 'from-amber-500/45 via-orange-500/35 to-rose-500/35 dark:from-amber-400/25 dark:via-orange-400/20 dark:to-rose-400/20',
    headerBorder: 'border-amber-200/70 dark:border-amber-500/20'
  },
  {
    border: 'border-sky-200/70 dark:border-sky-500/20',
    bg: 'bg-gradient-to-br from-sky-50/60 via-white to-white dark:from-sky-950/25 dark:to-white/5',
    accent: 'from-sky-500/45 via-cyan-500/35 to-indigo-500/35 dark:from-sky-400/25 dark:via-cyan-400/20 dark:to-indigo-400/20',
    headerBorder: 'border-sky-200/70 dark:border-sky-500/20'
  },
  {
    border: 'border-rose-200/70 dark:border-rose-500/20',
    bg: 'bg-gradient-to-br from-rose-50/60 via-white to-white dark:from-rose-950/25 dark:to-white/5',
    accent: 'from-rose-500/45 via-fuchsia-500/35 to-purple-500/35 dark:from-rose-400/25 dark:via-fuchsia-400/20 dark:to-purple-400/20',
    headerBorder: 'border-rose-200/70 dark:border-rose-500/20'
  },
  {
    border: 'border-indigo-200/70 dark:border-indigo-500/20',
    bg: 'bg-gradient-to-br from-indigo-50/60 via-white to-white dark:from-indigo-950/25 dark:to-white/5',
    accent: 'from-indigo-500/45 via-sky-500/35 to-emerald-500/35 dark:from-indigo-400/25 dark:via-sky-400/20 dark:to-emerald-400/20',
    headerBorder: 'border-indigo-200/70 dark:border-indigo-500/20'
  }
];

function stablePaletteIndex(key: string, mod: number): number {
  let acc = 0;
  for (let i = 0; i < key.length; i++) acc = (acc * 31 + key.charCodeAt(i)) >>> 0;
  return mod > 0 ? acc % mod : 0;
}

function paletteForLane(lane: Lane): LanePalette | null {
  if (lane.assigneeType !== 'employee') return null;
  const idx = stablePaletteIndex(`${lane.assigneeId}|${lane.id}`, employeeLanePalettes.length);
  return employeeLanePalettes[idx] ?? null;
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
  const palette = isTeamLane ? null : paletteForLane(lane);

  return (
    <section
      aria-label={lane.title}
      className={[
        'relative flex h-[72vh] flex-col overflow-hidden rounded-3xl border shadow-sm backdrop-blur-xl md:h-[78vh]',
        isTeamLane
          ? 'border-cyan-200/70 bg-gradient-to-br from-cyan-50/60 via-white to-white dark:border-cyan-500/20 dark:from-cyan-950/25 dark:to-white/5'
          : palette
            ? `${palette.border} ${palette.bg}`
            : 'border-slate-200/70 bg-white/60',
        'dark:border-white/10 dark:bg-white/5 dark:shadow-black/20',
        isOver ? 'ring-2 ring-indigo-400/40' : 'ring-1 ring-black/5 dark:ring-white/5'
      ].join(' ')}
    >
      {isTeamLane ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500/55 via-indigo-500/45 to-fuchsia-500/45 dark:from-cyan-400/35 dark:via-indigo-400/25 dark:to-fuchsia-400/25" />
      ) : palette ? (
        <div
          className={[
            'pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r',
            palette.accent
          ].join(' ')}
        />
      ) : null}

      <div
        ref={headerRef}
        className={[
          'flex items-baseline justify-between gap-3 border-b px-5 py-4',
          isTeamLane
            ? 'border-cyan-200/70 dark:border-cyan-500/20'
            : palette
              ? palette.headerBorder
              : 'border-slate-200/70 dark:border-white/10',
          isOverHeader ? 'bg-indigo-500/5 dark:bg-white/5' : ''
        ].join(' ')}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{lane.title}</div>
          {isTeamLane ? (
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
          ) : null}
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

      <div
        ref={bodyRef}
        className={[
          'flex flex-1 flex-col gap-3 overflow-y-auto p-5',
          isOverBody ? 'bg-indigo-500/5 dark:bg-white/5' : ''
        ].join(' ')}
      >
        <div className="shrink-0 rounded-2xl border border-slate-200/70 bg-white/50 px-3 py-2 text-xs text-slate-600 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
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

  const isTeamQueue = problem.owner.type === 'team';

  const closeTimerRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<
    | {
        open: true;
        title: string;
        opened?: string;
        category?: string;
        customer?: string;
        age?: string;
        description: string;
        anchor: DOMRect;
      }
    | { open: false }
  >({ open: false });

  function cancelScheduledClose() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleClose(delayMs = 120) {
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => setTooltip({ open: false }), delayMs);
  }

  function openTooltip(anchorEl: HTMLElement) {
    const description = problem.description && problem.description.trim().length ? problem.description : 'No description';
    const openedInfo = formatOpenedInfo(problem);

    setTooltip({
      open: true,
      title: problem.title,
      opened: openedInfo?.openedLine,
      category: problem.categoryFullName && problem.categoryFullName.trim().length ? problem.categoryFullName : undefined,
      customer: problem.customerName && problem.customerName.trim().length ? problem.customerName : undefined,
      age: openedInfo?.ageHoursLine,
      description,
      anchor: anchorEl.getBoundingClientRect()
    });
  }

  const style: import('react').CSSProperties = {
    transform: CSS.Translate.toString(transform)
  };

  return (
    <article
      ref={setNodeRef}
      className={[
        'min-h-[88px] rounded-2xl border p-3 text-left shadow-sm backdrop-blur',
        isTeamQueue
          ? 'border-rose-200/80 bg-rose-50/70'
          : 'border-slate-200/70 bg-white/80',
        'dark:border-white/10 dark:bg-white/5 dark:shadow-black/20',
        'cursor-grab active:cursor-grabbing',
        isTeamQueue
          ? 'transition-colors hover:bg-rose-50 hover:border-rose-300 hover:shadow-md dark:hover:bg-rose-500/10 dark:hover:border-rose-400/25'
          : 'transition-colors hover:bg-white hover:border-slate-300 hover:shadow-md dark:hover:bg-white/10 dark:hover:border-white/15',
        isDragging ? 'opacity-40' : ''
      ].join(' ')}
      style={style}
      {...listeners}
      {...attributes}
    >
      <div className="text-sm font-semibold leading-snug text-slate-900 dark:text-white">{problem.title}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="group relative">
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/70 bg-white/60 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            aria-label={problem.description ? `Info: ${problem.title}` : `Info: ${problem.title} (no description)`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onPointerEnter={(e) => {
              cancelScheduledClose();
              openTooltip(e.currentTarget as HTMLElement);
            }}
            onPointerLeave={() => scheduleClose(120)}
            onFocus={(e) => {
              cancelScheduledClose();
              openTooltip(e.currentTarget as HTMLElement);
            }}
            onBlur={() => scheduleClose(0)}
          >
            i
          </button>
        </div>
        <span
          className={[
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]',
            chipTone('status', problem.status)
          ].join(' ')}
        >
          {problem.statusLabel ?? problem.status}
        </span>
      </div>

      {tooltip.open
        ? createPortal(
            (() => {
              const width = 420;
              const margin = 12;
              const left = clamp(tooltip.anchor.right - width, margin, window.innerWidth - margin - width);
              const top = clamp(tooltip.anchor.bottom + 10, margin, window.innerHeight - margin - 220);

              return (
                <div
                  role="tooltip"
                  className={[
                    'fixed z-[9999] w-[420px] max-w-[calc(100vw-24px)] rounded-3xl border border-slate-200/70 bg-white/95 p-4 text-xs text-slate-800 shadow-lg backdrop-blur-2xl',
                    'dark:border-white/10 dark:bg-slate-950/80 dark:text-slate-100'
                  ].join(' ')}
                  style={{ left, top }}
                  onPointerEnter={() => cancelScheduledClose()}
                  onPointerLeave={() => scheduleClose(120)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-300">
                        Problem
                      </div>
                      <div className="mt-0.5 break-words text-sm font-semibold leading-snug text-slate-900 dark:text-white">
                        {tooltip.title}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-full border border-slate-200/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                      Info
                    </div>
                  </div>

                  {(tooltip.opened || tooltip.category || tooltip.customer || tooltip.age) ? (
                    <div className="mt-3 rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 backdrop-blur dark:border-white/10 dark:bg-white/5">
                      <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-1">
                        {tooltip.opened ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">Opened</dt>
                            <dd className="break-words text-slate-900 dark:text-slate-50">{tooltip.opened.replace(/^Opened:\s*/i, '')}</dd>
                          </>
                        ) : null}
                        {tooltip.category ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">Category</dt>
                            <dd className="break-words text-slate-900 dark:text-slate-50">{tooltip.category}</dd>
                          </>
                        ) : null}
                        {tooltip.customer ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">Customer</dt>
                            <dd className="break-words text-slate-900 dark:text-slate-50">{tooltip.customer}</dd>
                          </>
                        ) : null}
                        {tooltip.age ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">Age</dt>
                            <dd className="break-words text-slate-900 dark:text-slate-50">{tooltip.age.replace(/^Age:\s*/i, '')}</dd>
                          </>
                        ) : null}
                      </dl>
                    </div>
                  ) : null}

                  <div className="mt-3 border-t border-slate-200/70 pt-3 dark:border-white/10">
                    <div className="text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-300">
                      Description
                    </div>
                    <div className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words pr-1 text-slate-800 dark:text-slate-100">
                      {tooltip.description}
                    </div>
                  </div>
                </div>
              );
            })(),
            document.body
          )
        : null}

      {problem.tags.length ? (
        null
      ) : null}
    </article>
  );
}

export default function Board({ model }: { model: Model }) {
  const [problems, setProblems] = useState<Problem[]>(model.problems);
  const [activeProblemId, setActiveProblemId] = useState<string | null>(null);
  const [activeLaneDragId, setActiveLaneDragId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setProblems(model.problems);
    setActiveProblemId(null);
    setActiveLaneDragId(null);
    setMessage(null);
  }, [model]);

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
        const od = openedEpochForSort(a) - openedEpochForSort(b);
        if (od !== 0) return od;

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
              className={[
                'rounded-2xl border p-3 shadow-lg backdrop-blur dark:border-white/10 dark:shadow-black/30',
                activeProblem.owner.type === 'team'
                  ? 'border-rose-200/80 bg-rose-50/80 dark:bg-rose-500/10'
                  : 'border-slate-200/70 bg-white/80 dark:bg-white/10'
              ].join(' ')}
              style={{ cursor: 'grabbing' }}
            >
              <div className="text-sm font-semibold leading-snug text-slate-900 dark:text-white">
                {activeProblem.title}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/70 bg-white/60 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                  title={`${activeProblem.title}${activeProblem.description ? `\n\n${activeProblem.description}` : ''}`}
                >
                  i
                </span>
                <span
                  className={[
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]',
                    chipTone('status', activeProblem.status)
                  ].join(' ')}
                >
                  {activeProblem.statusLabel ?? activeProblem.status}
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
