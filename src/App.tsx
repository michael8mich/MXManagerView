import { useEffect, useMemo, useState } from 'react';
import Board from './board/Board';
import { sampleData } from './model/sampleData';

export default function App() {
  const today = useMemo(() => new Date().toLocaleDateString(), []);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = window.localStorage.getItem('mxmanv.theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    window.localStorage.setItem('mxmanv.theme', theme);
  }, [theme]);

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
        <Board model={sampleData} />
      </main>
    </div>
  );
}
