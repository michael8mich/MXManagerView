import type { Problem } from '../model/types';
type TFn = (key: string, options?: Record<string, unknown>) => string;

// Read thresholds from env (VITE_OPEN_AGE_CHART_THRESHOLDS=2,7)
const thresholds = (() => {
  const raw = (import.meta as any).env?.VITE_OPEN_AGE_CHART_THRESHOLDS;
  if (typeof raw === 'string') {
    const parts = raw.split(',').map(Number).filter((n) => !isNaN(n));
    if (parts.length === 2) return parts;
  }
  return [2, 7];
})();

export function AgeMiniChart({ t, problem }: { t: TFn; problem: Problem }) {
  const epoch = problem.openedAtEpochSeconds;
  if (typeof epoch !== 'number') return null;
  const openedMs = epoch * 1000;
  if (!Number.isFinite(openedMs)) return null;

  const ageMs = Math.max(0, Date.now() - openedMs);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const maxDays = 30;
  const pct = Math.min(Math.max((ageDays / maxDays) * 100, 0), 100);

  // Use env-configurable thresholds
  const tone = ageDays >= thresholds[1]
    ? 'bg-rose-500/60 dark:bg-rose-400/35'
    : ageDays >= thresholds[0]
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
        <div className={["h-full rounded-full", tone].join(' ')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatAgeFromMs(t: TFn, deltaMs: number): string {
  const safeMs = Math.max(0, deltaMs);
  const totalMinutes = Math.floor(safeMs / (1000 * 60));
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const totalDays = Math.floor(totalHours / 24);
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
