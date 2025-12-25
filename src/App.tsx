import { useEffect, useMemo, useState } from 'react';
import Board from './board/Board';
import { sampleData } from './model/sampleData';
import type { Model } from './model/types';
import {
  listGroups,
  modelFromPublicData,
  type PublicDataJson,
  type PublicGroup
} from './model/fromPublicData';

export default function App() {
  const today = useMemo(() => new Date().toLocaleDateString(), []);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = window.localStorage.getItem('mxmanv.theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [model, setModel] = useState<Model>(() => sampleData);
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const [publicData, setPublicData] = useState<PublicDataJson | null>(null);
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [selectedGroupUuid, setSelectedGroupUuid] = useState<string | null>(() =>
    window.localStorage.getItem('mxmanv.group_uuid')
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    window.localStorage.setItem('mxmanv.theme', theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/data.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PublicDataJson;
        const next = modelFromPublicData(json);
        if (cancelled) return;
        setPublicData(json);
        const g = listGroups(json);
        setGroups(g);

        const saved = window.localStorage.getItem('mxmanv.group_uuid');
        const initialGroup = saved && g.some((x) => x.group_uuid === saved) ? saved : g[0]?.group_uuid ?? null;
        setSelectedGroupUuid(initialGroup);
        setModel(initialGroup ? modelFromPublicData(json, { group_uuid: initialGroup }) : next);
        setDataNotice(null);
      } catch {
        if (cancelled) return;
        setModel(sampleData);
        setPublicData(null);
        setGroups([]);
        setDataNotice('Using sample data (failed to load /data.json)');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!publicData || !selectedGroupUuid) return;
    window.localStorage.setItem('mxmanv.group_uuid', selectedGroupUuid);
    setModel(modelFromPublicData(publicData, { group_uuid: selectedGroupUuid }));
  }, [publicData, selectedGroupUuid]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/60 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/30 dark:shadow-black/20">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              Mx Manager View
            </div>
            <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              Drag problems between Team / Employees • {today}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {groups.length >= 1 ? (
              <label className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/60 px-3 py-1 text-xs text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                <span className="text-slate-500 dark:text-slate-300">Team</span>
                <select
                  className="bg-transparent text-xs font-semibold text-slate-900 outline-none dark:text-slate-100"
                  value={selectedGroupUuid ?? ''}
                  onChange={(e) => setSelectedGroupUuid(e.target.value)}
                >
                  {groups.map((g) => (
                    <option key={g.group_uuid} value={g.group_uuid}>
                      {g.group_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="hidden rounded-full border border-slate-200/70 bg-white/60 px-3 py-1 text-xs text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200 sm:block">
              Illegal moves show a message
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200/70 bg-white/60 px-4 py-2 text-xs font-semibold text-slate-900 shadow-sm backdrop-blur hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-black/20 dark:hover:bg-white/10"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            >
              Theme: {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {dataNotice ? (
          <div className="mb-4 rounded-2xl border border-amber-200/70 bg-white/60 px-4 py-3 text-sm text-amber-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:shadow-black/20">
            {dataNotice}
          </div>
        ) : null}
        <Board model={model} />
      </main>
    </div>
  );
}
