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
import { useTranslation } from 'react-i18next';
import type { Lane, Model, OwnerRef, Problem } from '../model/types';
import { isMoveAllowed } from '../model/rules';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

function formatAgeFromMs(t: TFn, deltaMs: number): string {
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
  if (years) parts.push(t('duration.y', { count: years }));
  if (months) parts.push(t('duration.mo', { count: months }));
  if (days) parts.push(t('duration.d', { count: days }));
  parts.push(t('duration.h', { count: hours }));
  parts.push(t('duration.m', { count: minutes }));
  return parts.join(' ');
}

function formatOpenedInfo(t: TFn, problem: Problem): { openedText: string; ageText: string } | null {
  const epoch = problem.openedAtEpochSeconds;
  const openedDate = typeof epoch === 'number' ? new Date(epoch * 1000) : null;
  if (!openedDate || Number.isNaN(openedDate.getTime())) return null;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const openedText = `${pad2(openedDate.getDate())}/${pad2(openedDate.getMonth() + 1)}/${openedDate.getFullYear()} ${pad2(openedDate.getHours())}:${pad2(openedDate.getMinutes())}`;

  const ageText = formatAgeFromMs(t, Date.now() - openedDate.getTime());
  return { openedText, ageText };
}

function formatDateTimeFromEpochSeconds(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

function problemTypeTone(value: string) {
  switch (value) {
    case 'R':
      return 'border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200';
    case 'I':
      return 'border-rose-500/25 bg-rose-500/10 text-rose-800 dark:text-rose-200';
    default:
      return 'border-slate-500/25 bg-slate-500/10 text-slate-800 dark:text-slate-200';
  }
}

function problemTypeChipBg(value: string) {
  switch (value) {
    case 'R':
      return 'bg-gradient-to-br from-sky-500/20 via-white/40 to-indigo-500/15 dark:from-sky-400/12 dark:via-white/5 dark:to-indigo-400/10';
    case 'I':
      return 'bg-gradient-to-br from-rose-500/20 via-white/40 to-amber-500/15 dark:from-rose-400/12 dark:via-white/5 dark:to-amber-400/10';
    default:
      return 'bg-white/60 dark:bg-white/5';
  }
}

function ProblemTypeIcon({ type }: { type: string }) {
  if (type === 'R') {
    // Request: clipboard-check (custom)
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
        <path
          d="M9 4.5h6a1.5 1.5 0 0 1 1.5 1.5V20H7.5V6A1.5 1.5 0 0 1 9 4.5Z"
          className="stroke-current"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M9 4.5c0-1 1-2 3-2s3 1 3 2"
          className="stroke-current"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M9.2 12.2l1.6 1.6 3.8-3.8"
          className="stroke-current"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (type === 'I') {
    // Incident: siren/alert (custom)
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
        <path
          d="M7 11a5 5 0 1 1 10 0v5H7v-5Z"
          className="stroke-current"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M6 20h12"
          className="stroke-current"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M12 6v2"
          className="stroke-current"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M9.5 13.2h5"
          className="stroke-current"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return <span className="text-[11px] font-semibold">{type}</span>;
}

function problemTypeBorder(value: string | undefined) {
  const t = (value || '').toUpperCase();
  if (t === 'R') {
    return {
      border: 'border-sky-300/80 dark:border-sky-400/25',
      hoverBorder: 'hover:border-sky-400/80 dark:hover:border-sky-400/35'
    };
  }
  if (t === 'I') {
    return {
      border: 'border-rose-300/80 dark:border-rose-400/25',
      hoverBorder: 'hover:border-rose-400/80 dark:hover:border-rose-400/35'
    };
  }
  return {
    border: 'border-slate-200/70 dark:border-white/10',
    hoverBorder: 'hover:border-slate-300 dark:hover:border-white/15'
  };
}

function AttachmentsIndicator({ t, count }: { t: TFn; count: number }) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/60 px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
      title={t('tooltip.attachments', { count })}
      aria-label={t('tooltip.attachments', { count })}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
        <path
          d="M21 11.5l-8.2 8.2a5.5 5.5 0 0 1-7.8-7.8l9-9a3.5 3.5 0 0 1 5 5l-9.2 9.2a1.5 1.5 0 0 1-2.1-2.1L16 7.9"
          className="stroke-current"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {count}
    </span>
  );
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
  const { t } = useTranslation();
  const isTeamLane = lane.assigneeType === 'team';
  const isOver = isOverHeader || isOverBody;
  const palette = isTeamLane ? null : paletteForLane(lane);
  const laneLabel = isTeamLane ? t('lane.teamQueueTitle', { team: lane.title }) : lane.title;

  return (
    <section
      aria-label={laneLabel}
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
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{laneLabel}</div>
          {isTeamLane ? (
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span
                className={[
                  'inline-flex items-center rounded-full border px-2 py-0.5',
                  chipTone('type', lane.assigneeType)
                ].join(' ')}
              >
                {t('lane.type.team')}
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-600 dark:text-slate-300">{t('lane.itemsCount', { count: problems.length })}</span>
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
              title={t('lane.moveAllTitle')}
              {...moveAllHandle.listeners}
              {...moveAllHandle.attributes}
            >
              {t('lane.moveAll')}
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
          {t('lane.dropHint')}
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

function AgeMiniChart({ t, problem }: { t: TFn; problem: Problem }) {
  const epoch = problem.openedAtEpochSeconds;
  if (typeof epoch !== 'number') return null;
  const openedMs = epoch * 1000;
  if (!Number.isFinite(openedMs)) return null;

  const ageMs = Math.max(0, Date.now() - openedMs);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const maxDays = 30;
  const pct = clamp((ageDays / maxDays) * 100, 0, 100);

  const tone = ageDays >= 7
    ? 'bg-rose-500/60 dark:bg-rose-400/35'
    : ageDays >= 2
      ? 'bg-amber-500/60 dark:bg-amber-400/35'
      : 'bg-emerald-500/60 dark:bg-emerald-400/35';

  const ageText = formatAgeFromMs(t, ageMs);

  return (
    <div
      className="flex items-center gap-1"
      title={`${t('tooltip.age')}: ${ageText}`}
      aria-label={`${t('tooltip.age')}: ${ageText}`}
    >
      <div className="h-2 w-10 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10">
        <div className={['h-full rounded-full', tone].join(' ')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CountMiniBar({ count }: { count: number }) {
  const safe = Number.isFinite(count) ? Math.max(0, count) : 0;
  const max = 10;
  const pct = clamp((safe / max) * 100, 0, 100);
  const tone = safe >= 8
    ? 'bg-rose-500/60 dark:bg-rose-400/35'
    : safe >= 4
      ? 'bg-amber-500/60 dark:bg-amber-400/35'
      : 'bg-sky-500/60 dark:bg-sky-400/35';

  return (
    <div className="h-2 w-14 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10" aria-hidden="true">
      <div className={['h-full rounded-full', tone].join(' ')} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ProblemCard({ problem }: { problem: Problem }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: problem.id
  });

  function mflowUrlForProblem(p: Problem): string | null {
    const recordNumber = p.recordNumber;
    if (typeof recordNumber !== 'number' || !Number.isFinite(recordNumber)) return null;

    const type = (p.problemType || '').toUpperCase();
    const path = type === 'R' ? 'crdtl' : type === 'I' ? 'indtl' : null;
    if (!path) return null;

    const base = (import.meta as any).env?.VITE_MFLOW_BASE_URL || 'http://mx/mFlow';
    return `${String(base).replace(/\/$/, '')}/#/cr/${path}/${recordNumber}`;
  }

  const isTeamQueue = problem.owner.type === 'team';
  const typeBorder = problemTypeBorder(problem.problemType);

  const closeTimerRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<
    | {
        open: true;
        title: string;
        opened?: string;
        lastUpdated?: string;
        lastUpdatedAge?: string;
        lastUpdatedBy?: string;
        workflowsCount?: number;
        asset?: string;
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
    const description =
      problem.description && problem.description.trim().length ? problem.description : t('tooltip.noDescription');
    const openedInfo = formatOpenedInfo(t, problem);
    const lastUpdated =
      typeof problem.lastModifiedAtEpochSeconds === 'number'
        ? formatDateTimeFromEpochSeconds(problem.lastModifiedAtEpochSeconds)
        : undefined;

    const lastUpdatedAge = (() => {
      const epoch = problem.lastModifiedAtEpochSeconds;
      if (typeof epoch !== 'number') return undefined;
      const updatedMs = epoch * 1000;
      if (!Number.isFinite(updatedMs)) return undefined;
      const ageMs = Math.max(0, Date.now() - updatedMs);
      return formatAgeFromMs(t, ageMs);
    })();
    const lastUpdatedBy =
      problem.lastModifiedByName && problem.lastModifiedByName.trim().length
        ? problem.lastModifiedByName
        : undefined;

    setTooltip({
      open: true,
      title: problem.title,
      opened: openedInfo?.openedText,
      lastUpdated: lastUpdated && lastUpdated.length ? lastUpdated : undefined,
      lastUpdatedAge: lastUpdatedAge && lastUpdatedAge.length ? lastUpdatedAge : undefined,
      lastUpdatedBy,
      workflowsCount: typeof problem.workflowsCount === 'number' && problem.workflowsCount > 0 ? problem.workflowsCount : undefined,
      asset: problem.assetName && problem.assetName.trim().length ? problem.assetName : undefined,
      category: problem.categoryFullName && problem.categoryFullName.trim().length ? problem.categoryFullName : undefined,
      customer: problem.customerName && problem.customerName.trim().length ? problem.customerName : undefined,
      age: openedInfo?.ageText,
      description,
      anchor: anchorEl.getBoundingClientRect()
    });
  }

  const style: import('react').CSSProperties = {
    transform: CSS.Translate.toString(transform)
  };

  const mflowUrl = mflowUrlForProblem(problem);
  const titleMatch = problem.title.match(/^#(\S+)\s+(.*)$/);
  const displayRef = titleMatch?.[1] ?? (typeof problem.recordNumber === 'number' ? String(problem.recordNumber) : null);
  const displayTitle = titleMatch?.[2] ?? problem.title;

  return (
    <article
      ref={setNodeRef}
      className={[
        'min-h-[88px] rounded-2xl border p-3 text-left shadow-sm backdrop-blur',
        typeBorder.border,
        isTeamQueue ? 'bg-rose-50/70' : 'bg-white/80',
        'dark:bg-white/5 dark:shadow-black/20',
        'cursor-grab active:cursor-grabbing',
        isTeamQueue
          ? ['transition-colors hover:bg-rose-50 hover:shadow-md dark:hover:bg-rose-500/10', typeBorder.hoverBorder].join(' ')
          : ['transition-colors hover:bg-white hover:shadow-md dark:hover:bg-white/10', typeBorder.hoverBorder].join(' '),
        isDragging ? 'opacity-40' : ''
      ].join(' ')}
      style={style}
      {...listeners}
      {...attributes}
    >
      <div className="text-sm font-semibold leading-snug text-slate-900 dark:text-white">
        {displayRef ? (
          mflowUrl ? (
            <a
              href={mflowUrl}
              target="_blank"
              rel="noreferrer"
              className="mr-2 inline-flex items-center rounded-full border border-slate-200/70 bg-white/60 px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Open ${displayRef}`}
              title={mflowUrl}
            >
              #{displayRef}
            </a>
          ) : (
            <span className="mr-2 inline-flex items-center rounded-full border border-slate-200/70 bg-white/60 px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              #{displayRef}
            </span>
          )
        ) : null}
        <span>{displayTitle}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="group relative">
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/70 bg-white/60 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            aria-label={`${t('tooltip.pill')}: ${problem.title}`}
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
        <div className="flex items-center gap-2">
          {problem.problemType ? (
            <span
              className={[
                'inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-sm backdrop-blur',
                problemTypeTone(problem.problemType),
                problemTypeChipBg(problem.problemType)
              ].join(' ')}
              title={
                problem.problemType === 'R'
                  ? t('problemType.request')
                  : problem.problemType === 'I'
                    ? t('problemType.incident')
                    : problem.problemType
              }
              aria-label={
                problem.problemType === 'R'
                  ? t('problemType.request')
                  : problem.problemType === 'I'
                    ? t('problemType.incident')
                    : problem.problemType
              }
            >
              <ProblemTypeIcon type={problem.problemType} />
            </span>
          ) : null}

          <AttachmentsIndicator t={t} count={problem.attachmentsCount ?? 0} />

          <AgeMiniChart t={t} problem={problem} />
          <span
            className={[
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]',
              chipTone('status', problem.status)
            ].join(' ')}
          >
            {problem.statusLabel ?? problem.status}
          </span>
        </div>
      </div>

      {tooltip.open
        ? createPortal(
            (() => {
              const width = 420;
              const margin = 12;
              const left = clamp(tooltip.anchor.right - width, margin, window.innerWidth - margin - width);
              const maxH = Math.max(160, window.innerHeight - margin * 2);
              const estimatedH = 360;
              const belowTop = tooltip.anchor.bottom + 10;
              const aboveTop = tooltip.anchor.top - 10 - estimatedH;
              const preferBelow = belowTop + estimatedH <= window.innerHeight - margin;
              const topPreferred = preferBelow ? belowTop : aboveTop;
              const top = clamp(topPreferred, margin, window.innerHeight - margin - Math.min(estimatedH, maxH));

              return (
                <div
                  role="tooltip"
                  className={[
                    'fixed z-[9999] w-[420px] max-w-[calc(100vw-24px)] overflow-auto rounded-3xl border border-slate-200/70 bg-white/95 p-4 text-xs text-slate-800 shadow-lg backdrop-blur-2xl',
                    'dark:border-white/10 dark:bg-slate-950/80 dark:text-slate-100'
                  ].join(' ')}
                  style={{ left, top, maxHeight: maxH }}
                  onPointerEnter={() => cancelScheduledClose()}
                  onPointerLeave={() => scheduleClose(120)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-300">
                        {t('tooltip.sectionProblem')}
                      </div>
                      <div className="mt-0.5 break-words text-sm font-semibold leading-snug text-slate-900 dark:text-white">
                        {tooltip.title}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-full border border-slate-200/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                      {t('tooltip.pill')}
                    </div>
                  </div>

                  {(tooltip.opened || tooltip.lastUpdated || tooltip.lastUpdatedBy || tooltip.asset || tooltip.category || tooltip.customer || tooltip.age || (typeof tooltip.workflowsCount === 'number' && tooltip.workflowsCount > 0)) ? (
                    <div className="mt-3 rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 backdrop-blur dark:border-white/10 dark:bg-white/5">
                      <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-1">
                        {tooltip.opened ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">{t('tooltip.opened')}</dt>
                            <dd className="break-words text-slate-900 dark:text-slate-50">{tooltip.opened}</dd>
                          </>
                        ) : null}
                        {tooltip.age ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">{t('tooltip.age')}</dt>
                            <dd className="break-words text-slate-900 dark:text-slate-50">{t('tooltip.ageValue', { age: tooltip.age })}</dd>
                          </>
                        ) : null}
                        {tooltip.lastUpdated ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">{t('tooltip.lastUpdated')}</dt>
                            <dd className="break-words text-slate-900 dark:text-slate-50">{tooltip.lastUpdated}</dd>
                          </>
                        ) : null}
                        {tooltip.lastUpdatedAge ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">{t('tooltip.lastUpdatedAge')}</dt>
                            <dd className="break-words text-slate-900 dark:text-slate-50">{t('tooltip.lastUpdatedAgeValue', { age: tooltip.lastUpdatedAge })}</dd>
                          </>
                        ) : null}
                        {tooltip.lastUpdatedBy ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">{t('tooltip.lastUpdatedBy')}</dt>
                            <dd className="break-words text-slate-900 dark:text-slate-50">{tooltip.lastUpdatedBy}</dd>
                          </>
                        ) : null}
                        {typeof tooltip.workflowsCount === 'number' && tooltip.workflowsCount > 0 ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">{t('tooltip.workflows')}</dt>
                            <dd className="flex items-center gap-2 text-slate-900 dark:text-slate-50">
                              <span className="text-xs font-semibold tabular-nums">{tooltip.workflowsCount}</span>
                              <CountMiniBar count={tooltip.workflowsCount} />
                            </dd>
                          </>
                        ) : null}
                        {tooltip.asset ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">{t('tooltip.asset')}</dt>
                            <dd className="break-words text-slate-900 dark:text-slate-50">{tooltip.asset}</dd>
                          </>
                        ) : null}
                        {tooltip.category ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">{t('tooltip.category')}</dt>
                            <dd className="break-words text-slate-900 dark:text-slate-50">{tooltip.category}</dd>
                          </>
                        ) : null}
                        {tooltip.customer ? (
                          <>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">{t('tooltip.customer')}</dt>
                            <dd className="break-words text-slate-900 dark:text-slate-50">{tooltip.customer}</dd>
                          </>
                        ) : null}
                      </dl>
                    </div>
                  ) : null}

                  <div className="mt-3 border-t border-slate-200/70 pt-3 dark:border-white/10">
                    <div className="text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-300">
                      {t('tooltip.description')}
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

function DashboardCard({
  rows
}: {
  rows: Array<{ name: string; total: number; requests: number; incidents: number }>;
}) {
  const { t } = useTranslation();
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0);
  const [view, setView] = useState<'list' | 'pie' | 'treemap'>('list');

  const pieRows = useMemo(() => rows.filter((r) => r.total > 0), [rows]);
  const pieTotal = useMemo(() => pieRows.reduce((s, r) => s + r.total, 0), [pieRows]);
  const piePalette = useMemo(
    () => [
      'stroke-sky-500/70 dark:stroke-sky-400/45',
      'stroke-rose-500/70 dark:stroke-rose-400/45',
      'stroke-emerald-500/70 dark:stroke-emerald-400/45',
      'stroke-amber-500/75 dark:stroke-amber-400/50',
      'stroke-violet-500/70 dark:stroke-violet-400/45',
      'stroke-cyan-500/70 dark:stroke-cyan-400/45',
      'stroke-fuchsia-500/70 dark:stroke-fuchsia-400/45',
      'stroke-lime-500/70 dark:stroke-lime-400/45'
    ],
    []
  );

  const treemapFillPalette = useMemo(
    () => [
      'fill-sky-500/20 dark:fill-sky-400/12',
      'fill-rose-500/20 dark:fill-rose-400/12',
      'fill-emerald-500/20 dark:fill-emerald-400/12',
      'fill-amber-500/20 dark:fill-amber-400/12',
      'fill-violet-500/20 dark:fill-violet-400/12',
      'fill-cyan-500/20 dark:fill-cyan-400/12',
      'fill-fuchsia-500/20 dark:fill-fuchsia-400/12',
      'fill-lime-500/20 dark:fill-lime-400/12'
    ],
    []
  );

  type DashboardRow = { name: string; total: number; requests: number; incidents: number };
  type TreemapRect = { x: number; y: number; w: number; h: number; r: DashboardRow; idx: number };

  function buildTreemapLayout(items: DashboardRow[], width: number, height: number): TreemapRect[] {
    const stable = [...items]
      .map((r, idx) => ({ r, idx }))
      .filter((x) => x.r.total > 0)
      .sort((a, b) => (b.r.total - a.r.total) || a.r.name.localeCompare(b.r.name));

    const sum = (arr: Array<{ r: DashboardRow }>) => arr.reduce((s, x) => s + x.r.total, 0);

    const partition = (arr: Array<{ r: DashboardRow; idx: number }>) => {
      const a: Array<{ r: DashboardRow; idx: number }> = [];
      const b: Array<{ r: DashboardRow; idx: number }> = [];
      let sa = 0;
      let sb = 0;
      for (const it of arr) {
        if (sa <= sb) {
          a.push(it);
          sa += it.r.total;
        } else {
          b.push(it);
          sb += it.r.total;
        }
      }
      return { a, b, sa, sb };
    };

    const out: TreemapRect[] = [];
    const layout = (
      arr: Array<{ r: DashboardRow; idx: number }>,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      if (arr.length === 0) return;
      if (arr.length === 1) {
        out.push({ x, y, w, h, r: arr[0].r, idx: arr[0].idx });
        return;
      }

      const total = sum(arr);
      if (total <= 0) return;

      const { a, b, sa } = partition(arr);
      const splitRatio = sa / total;

      if (w >= h) {
        const wA = w * splitRatio;
        layout(a, x, y, wA, h);
        layout(b, x + wA, y, w - wA, h);
      } else {
        const hA = h * splitRatio;
        layout(a, x, y, w, hA);
        layout(b, x, y + hA, w, h - hA);
      }
    };

    layout(stable, 0, 0, width, height);
    return out;
  }

  return (
    <section
      aria-label={t('dashboard.title')}
      className={[
        'relative flex h-[72vh] flex-col overflow-hidden rounded-3xl border shadow-sm backdrop-blur-xl md:h-[78vh]',
        'border-slate-200/70 bg-white/60 dark:border-white/10 dark:bg-white/5 dark:shadow-black/20',
        'ring-1 ring-black/5 dark:ring-white/5'
      ].join(' ')}
    >
      <div className="border-b border-slate-200/70 px-5 py-4 dark:border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">{t('dashboard.title')}</div>
            <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{t('dashboard.subtitle')}</div>
          </div>

          <div className="inline-flex overflow-hidden rounded-full border border-slate-200/70 bg-white/60 text-xs font-semibold text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
            <button
              type="button"
              className={[
                'px-3 py-1.5',
                view === 'list'
                  ? 'bg-white/70 text-slate-900 dark:bg-white/10 dark:text-white'
                  : 'hover:bg-white/60 dark:hover:bg-white/10'
              ].join(' ')}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              aria-label={t('dashboard.viewList')}
              title={t('dashboard.viewList')}
            >
              {t('dashboard.viewList')}
            </button>
            <button
              type="button"
              className={[
                'px-3 py-1.5',
                view === 'pie'
                  ? 'bg-white/70 text-slate-900 dark:bg-white/10 dark:text-white'
                  : 'hover:bg-white/60 dark:hover:bg-white/10'
              ].join(' ')}
              onClick={() => setView('pie')}
              aria-pressed={view === 'pie'}
              aria-label={t('dashboard.viewPie')}
              title={t('dashboard.viewPie')}
            >
              {t('dashboard.viewPie')}
            </button>
            <button
              type="button"
              className={[
                'px-3 py-1.5',
                view === 'treemap'
                  ? 'bg-white/70 text-slate-900 dark:bg-white/10 dark:text-white'
                  : 'hover:bg-white/60 dark:hover:bg-white/10'
              ].join(' ')}
              onClick={() => setView('treemap')}
              aria-pressed={view === 'treemap'}
              aria-label={t('dashboard.viewTreemap')}
              title={t('dashboard.viewTreemap')}
            >
              {t('dashboard.viewTreemap')}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/70 bg-white/50 px-3 py-2 text-xs text-slate-600 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
            {t('dashboard.empty')}
          </div>
        ) : view === 'pie' ? (
          <div className="rounded-2xl border border-slate-200/70 bg-white/50 p-4 backdrop-blur dark:border-white/10 dark:bg-white/5">
            {pieTotal === 0 ? (
              <div className="text-xs text-slate-600 dark:text-slate-200">{t('dashboard.empty')}</div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="relative mx-auto h-[220px] w-[220px]">
                  <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
                    <g transform="rotate(-90 50 50)">
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        className="stroke-slate-200/80 dark:stroke-white/10"
                        strokeWidth="12"
                        fill="none"
                      />

                      {(() => {
                        const radius = 38;
                        const circumference = 2 * Math.PI * radius;
                        let offset = 0;
                        return pieRows.map((r, idx) => {
                          const len = (r.total / pieTotal) * circumference;
                          const cls = piePalette[idx % piePalette.length];
                          const circle = (
                            <circle
                              key={r.name}
                              cx="50"
                              cy="50"
                              r={radius}
                              className={cls}
                              strokeWidth="12"
                              fill="none"
                              strokeDasharray={`${len} ${circumference - len}`}
                              strokeDashoffset={-offset}
                              strokeLinecap="butt"
                            >
                              <title>
                                {r.name}: {r.total} ({t('problemType.request')}: {r.requests}, {t('problemType.incident')}: {r.incidents})
                              </title>
                            </circle>
                          );
                          offset += len;
                          return circle;
                        });
                      })()}
                    </g>
                  </svg>

                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('dashboard.pieTotal')}</div>
                    <div className="mt-0.5 text-2xl font-semibold text-slate-900 dark:text-white">{pieTotal}</div>
                  </div>
                </div>

                <div className="w-full min-w-0">
                  <div className="grid grid-cols-1 gap-1">
                    {pieRows.map((r, idx) => (
                      <div
                        key={r.name}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/70 bg-white/40 px-2 py-1 text-[10px] backdrop-blur dark:border-white/10 dark:bg-white/5"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span
                            className={[
                              'h-2 w-2 shrink-0 rounded-full',
                              // map stroke palette to a matching bg for the legend dot
                              idx % piePalette.length === 0
                                ? 'bg-sky-500/70 dark:bg-sky-400/45'
                                : idx % piePalette.length === 1
                                  ? 'bg-rose-500/70 dark:bg-rose-400/45'
                                  : idx % piePalette.length === 2
                                    ? 'bg-emerald-500/70 dark:bg-emerald-400/45'
                                    : idx % piePalette.length === 3
                                      ? 'bg-amber-500/75 dark:bg-amber-400/50'
                                      : idx % piePalette.length === 4
                                        ? 'bg-violet-500/70 dark:bg-violet-400/45'
                                        : idx % piePalette.length === 5
                                          ? 'bg-cyan-500/70 dark:bg-cyan-400/45'
                                          : idx % piePalette.length === 6
                                            ? 'bg-fuchsia-500/70 dark:bg-fuchsia-400/45'
                                            : 'bg-lime-500/70 dark:bg-lime-400/45'
                            ].join(' ')}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 truncate font-semibold text-slate-900 dark:text-white">{r.name}</div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">{r.total}</div>
                          <div className="hidden items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300 sm:flex">
                            <span className="inline-flex items-center gap-1" title={t('problemType.request')} aria-label={t('problemType.request')}>
                              <span className="h-2 w-2 rounded-full bg-sky-500/60 dark:bg-sky-400/35" aria-hidden="true" />
                              <span className="font-semibold text-slate-700 dark:text-slate-200">{r.requests}</span>
                            </span>
                            <span className="inline-flex items-center gap-1" title={t('problemType.incident')} aria-label={t('problemType.incident')}>
                              <span className="h-2 w-2 rounded-full bg-rose-500/60 dark:bg-rose-400/35" aria-hidden="true" />
                              <span className="font-semibold text-slate-700 dark:text-slate-200">{r.incidents}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : view === 'treemap' ? (
          <div className="rounded-2xl border border-slate-200/70 bg-white/50 p-4 backdrop-blur dark:border-white/10 dark:bg-white/5">
            {pieTotal === 0 ? (
              <div className="text-xs text-slate-600 dark:text-slate-200">{t('dashboard.empty')}</div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-full max-w-[520px]">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('dashboard.pieTotal')}: {pieTotal}</div>
                  <div className="mt-2 rounded-2xl border border-slate-200/70 bg-white/40 p-2 backdrop-blur dark:border-white/10 dark:bg-white/5">
                    <svg viewBox="0 0 100 60" className="h-[220px] w-full" role="img" aria-label={t('dashboard.viewTreemap')}>
                      {(() => {
                        const rects = buildTreemapLayout(pieRows, 100, 60);
                        return rects.map((rr, i) => {
                          const fillCls = treemapFillPalette[i % treemapFillPalette.length];
                          const canLabel = rr.w >= 18 && rr.h >= 10;
                          const clipId = `tm-${i}`;
                          return (
                            <g key={`${rr.r.name}-${i}`}>
                              <clipPath id={clipId}>
                                <rect x={rr.x} y={rr.y} width={rr.w} height={rr.h} rx={2} ry={2} />
                              </clipPath>
                              <rect
                                x={rr.x}
                                y={rr.y}
                                width={rr.w}
                                height={rr.h}
                                rx={2}
                                ry={2}
                                className={[fillCls, 'stroke-slate-200/80 dark:stroke-white/10'].join(' ')}
                                strokeWidth={0.6}
                                vectorEffect="non-scaling-stroke"
                              >
                                <title>
                                  {rr.r.name}: {rr.r.total} ({t('problemType.request')}: {rr.r.requests}, {t('problemType.incident')}: {rr.r.incidents})
                                </title>
                              </rect>
                              {canLabel ? (
                                <g clipPath={`url(#${clipId})`}>
                                  <text
                                    x={rr.x + 1.8}
                                    y={rr.y + 1.8}
                                    fontSize={3.5}
                                    className="fill-slate-800/90 dark:fill-slate-100/90"
                                    dominantBaseline="hanging"
                                  >
                                    {rr.r.name}
                                  </text>
                                  <text
                                    x={rr.x + 1.8}
                                    y={rr.y + 6.3}
                                    fontSize={3.2}
                                    className="fill-slate-700/80 dark:fill-slate-200/80"
                                    dominantBaseline="hanging"
                                  >
                                    {rr.r.total}
                                  </text>
                                </g>
                              ) : null}
                            </g>
                          );
                        });
                      })()}
                    </svg>
                  </div>
                </div>

                <div className="w-full min-w-0">
                  <div className="grid grid-cols-1 gap-1">
                    {pieRows.map((r, idx) => (
                      <div
                        key={r.name}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/70 bg-white/40 px-2 py-1 text-[10px] backdrop-blur dark:border-white/10 dark:bg-white/5"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span
                            className={[
                              'h-2 w-2 shrink-0 rounded-full',
                              idx % piePalette.length === 0
                                ? 'bg-sky-500/70 dark:bg-sky-400/45'
                                : idx % piePalette.length === 1
                                  ? 'bg-rose-500/70 dark:bg-rose-400/45'
                                  : idx % piePalette.length === 2
                                    ? 'bg-emerald-500/70 dark:bg-emerald-400/45'
                                    : idx % piePalette.length === 3
                                      ? 'bg-amber-500/75 dark:bg-amber-400/50'
                                      : idx % piePalette.length === 4
                                        ? 'bg-violet-500/70 dark:bg-violet-400/45'
                                        : idx % piePalette.length === 5
                                          ? 'bg-cyan-500/70 dark:bg-cyan-400/45'
                                          : idx % piePalette.length === 6
                                            ? 'bg-fuchsia-500/70 dark:bg-fuchsia-400/45'
                                            : 'bg-lime-500/70 dark:bg-lime-400/45'
                            ].join(' ')}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 truncate font-semibold text-slate-900 dark:text-white">{r.name}</div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">{r.total}</div>
                          <div className="hidden items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300 sm:flex">
                            <span className="inline-flex items-center gap-1" title={t('problemType.request')} aria-label={t('problemType.request')}>
                              <span className="h-2 w-2 rounded-full bg-sky-500/60 dark:bg-sky-400/35" aria-hidden="true" />
                              <span className="font-semibold text-slate-700 dark:text-slate-200">{r.requests}</span>
                            </span>
                            <span className="inline-flex items-center gap-1" title={t('problemType.incident')} aria-label={t('problemType.incident')}>
                              <span className="h-2 w-2 rounded-full bg-rose-500/60 dark:bg-rose-400/35" aria-hidden="true" />
                              <span className="font-semibold text-slate-700 dark:text-slate-200">{r.incidents}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          rows.map((r) => {
            const pct = max > 0 ? Math.round((r.total / max) * 100) : 0;
            const total = r.total;
            const reqPct = total > 0 ? Math.round((r.requests / total) * 100) : 0;
            const incPct = total > 0 ? Math.round((r.incidents / total) * 100) : 0;
            return (
              <div key={r.name} className="rounded-2xl border border-slate-200/70 bg-white/50 p-3 backdrop-blur dark:border-white/10 dark:bg-white/5">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0 truncate text-xs font-semibold text-slate-900 dark:text-white">{r.name}</div>
                  <div className="shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200">{r.total}</div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10">
                    <div className="h-full" style={{ width: `${pct}%` }} aria-hidden="true">
                      <div className="flex h-full w-full">
                        <div
                          className="h-full bg-sky-500/60 dark:bg-sky-400/35"
                          style={{ width: `${reqPct}%` }}
                        />
                        <div
                          className="h-full bg-rose-500/60 dark:bg-rose-400/35"
                          style={{ width: `${incPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1" title={t('problemType.request')} aria-label={t('problemType.request')}>
                      <span className="h-2 w-2 rounded-full bg-sky-500/60 dark:bg-sky-400/35" aria-hidden="true" />
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{r.requests}</span>
                    </span>
                    <span className="inline-flex items-center gap-1" title={t('problemType.incident')} aria-label={t('problemType.incident')}>
                      <span className="h-2 w-2 rounded-full bg-rose-500/60 dark:bg-rose-400/35" aria-hidden="true" />
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{r.incidents}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export default function Board({ model, typeFilter }: { model: Model; typeFilter: 'both' | 'incident' | 'problem' }) {
  const { t } = useTranslation();
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

  const visibleProblems = useMemo(() => {
    if (typeFilter === 'both') return problems;
    const want = typeFilter === 'incident' ? 'I' : 'R';
    return problems.filter((p) => (p.problemType || '').toUpperCase() === want);
  }, [problems, typeFilter]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    })
  );

  const problemsByLane = useMemo(() => {
    const map = new Map<string, Problem[]>();
    for (const lane of lanes) map.set(lane.id, []);
    for (const p of visibleProblems) {
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
  }, [visibleProblems, lanes]);

  const sortedLanes = useMemo(() => {
    const laneCount = (laneId: string) => problemsByLane.get(laneId)?.length ?? 0;

    const teamLanes = lanes.filter((l) => l.assigneeType === 'team');
    const employeeLanes = lanes
      .filter((l) => l.assigneeType === 'employee')
      .slice()
      .sort((a, b) => {
        const diff = laneCount(b.id) - laneCount(a.id);
        if (diff !== 0) return diff;
        return a.title.localeCompare(b.title);
      });

    const otherLanes = lanes.filter((l) => l.assigneeType !== 'team' && l.assigneeType !== 'employee');
    return [...teamLanes, ...employeeLanes, ...otherLanes];
  }, [lanes, problemsByLane]);

  const dashboardRows = useMemo(() => {
    return lanes
      .filter((l) => l.assigneeType === 'employee')
      .map((l) => {
        const list = problemsByLane.get(l.id) ?? [];
        let requests = 0;
        let incidents = 0;
        for (const p of list) {
          const t = (p.problemType || '').toUpperCase();
          if (t === 'I') incidents += 1;
          else if (t === 'R') requests += 1;
        }
        const total = list.length;
        return { name: l.title, total, requests, incidents };
      })
      .sort((a, b) => {
        const diff = b.total - a.total;
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });
  }, [lanes, problemsByLane]);

  const activeProblem = useMemo(
    () => problems.find((p) => p.id === activeProblemId) ?? null,
    [activeProblemId, problems]
  );

  const activeLane = useMemo(() => {
    if (!activeLaneDragId) return null;
    const laneId = activeLaneDragId.replace(/^lane::/, '');
    return lanes.find((l) => l.id === laneId) ?? null;
  }, [activeLaneDragId, lanes]);

  function ownerTypeLabel(type: OwnerRef['type']) {
    return type === 'team' ? t('lane.type.team') : t('lane.type.employee');
  }

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
        setMessage(t('message.moveNotAllowed', { from: ownerTypeLabel(fromOwner.type), to: ownerTypeLabel(toOwner.type) }));
        clearMessageSoon();
        return;
      }

      const now = new Date().toISOString();
      const action = deriveAction(fromOwner, toOwner);

      setProblems((prev) => {
        const srcCount = prev.filter((p) => p.currentLaneId === srcLaneId).length;
        if (srcCount === 0) return prev;

        setMessage(t('message.movedCount', { count: srcCount }));
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
        setMessage(t('message.moveNotAllowed', { from: ownerTypeLabel(fromOwner.type), to: ownerTypeLabel(toOwner.type) }));
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
          <DashboardCard rows={dashboardRows} />
          {sortedLanes.map((lane) => (
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
              {t('drag.moveAllFrom', {
                lane:
                  activeLane.assigneeType === 'team'
                    ? t('lane.teamQueueTitle', { team: activeLane.title })
                    : activeLane.title
              })}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
