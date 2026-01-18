import { useEffect, useMemo, useState } from 'react';
import { Listbox } from '@headlessui/react';
// Inline ProblemTypeIcon from Board.tsx for use in select
function ProblemTypeIcon({ type }: { type: string }) {
  if (type === 'incident') {
    // Incident: siren/alert (custom)
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
        <path d="M7 11a5 5 0 1 1 10 0v5H7v-5Z" className="stroke-current" strokeWidth="2" strokeLinejoin="round" />
        <path d="M6 20h12" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 6v2" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
        <path d="M9.5 13.2h5" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'problem') {
    // Problem: clipboard-check (custom, same as R)
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
        <path d="M9 4.5h6a1.5 1.5 0 0 1 1.5 1.5V20H7.5V6A1.5 1.5 0 0 1 9 4.5Z" className="stroke-current" strokeWidth="2" strokeLinejoin="round" />
        <path d="M9 4.5c0-1 1-2 3-2s3 1 3 2" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
        <path d="M9.2 12.2l1.6 1.6 3.8-3.8" className="stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === 'rw') {
    // RW: gear wheel icon
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.6" fill="none">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.5v2.1M12 19.4v2.1M4.22 4.22l1.49 1.49M18.29 18.29l1.49 1.49M2.5 12h2.1M19.4 12h2.1M4.22 19.78l1.49-1.49M18.29 5.71l1.49-1.49" />
          <path d="M7.5 12a4.5 4.5 0 0 1 9 0 4.5 4.5 0 0 1-9 0z" opacity=".3" />
        </g>
      </svg>
    );
  }
  if (type === 'cw') {
    // CW: wrench icon
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.6" fill="none">
          <path d="M21 19.3l-6.1-6.1a5.5 5.5 0 0 1-7.8-7.8l1.4 1.4a3.5 3.5 0 0 0 5 5l6.1 6.1a1.5 1.5 0 0 0 2.1-2.1z" />
          <circle cx="7.5" cy="7.5" r="3.5" opacity=".3" />
        </g>
      </svg>
    );
  }
  if (type === 'both') {
    // Both: show two icons
    return (
      <span className="inline-flex items-center gap-0.5">
        <ProblemTypeIcon type="incident" />
        <ProblemTypeIcon type="problem" />
      </span>
    );
  }
  return null;
}
import { useTranslation } from 'react-i18next';
import Board from './board/Board';
import { ServerUpdateBanner } from './ServerUpdateBanner';
import { sampleData } from './model/sampleData';
import type { Model } from './model/types';
import {
  listGroups,
  modelFromPublicData,
  type PublicGrpMem,
  type PublicDataJson,
  type PublicGroup
} from './model/fromPublicData';
import i18n, { isRtl, type SupportedLang } from './i18n';
import {
  fetchMxLoginUserInfo,
  fetchMxProblems,
  fetchMxUsername,
  mxRemoteMode,
  mxUseRemoteApi,
  type MxLoginUserInfo
} from './api/mxQuery';

function PlaneScreensaver({ visible }: { visible: boolean }) {
  if (!visible) return null;

  const [bgUrl, setBgUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBgUrl(null);


    const version = '20251228';
    const base = (import.meta.env.BASE_URL || '/');
    const candidates = [
      `${base}screensaver-plane.jpg`,
      `${base}screensaver-plane.jpeg`,
      `${base}screensaver-plane.png`,
      `${base}screensaver-plane.webp`
    ];

    (async () => {
      for (const url of candidates) {
        const ok = await new Promise<boolean>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = `${url}?v=${version}`;
        });
        if (cancelled) return;
        if (ok) {
          setBgUrl(`${url}?v=${version}`);
          return;
        }
      }

      // eslint-disable-next-line no-console
      console.warn(
        '[MxManagerView] Screensaver image not found. Add one of: public/screensaver-plane.jpg|jpeg|png|webp'
      );
    }
    // End of async IIFE
    )();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black"
    >
      <div className="relative h-full w-full overflow-hidden">
        <div
          className="mx-screensaverBg absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: bgUrl
              ? `url(${bgUrl})`
              : 'radial-gradient(1200px 600px at 20% 20%, rgba(59,130,246,0.18), transparent 60%), radial-gradient(900px 500px at 80% 30%, rgba(14,165,233,0.14), transparent 55%), radial-gradient(800px 500px at 50% 85%, rgba(99,102,241,0.12), transparent 55%)'
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-black/10 to-black/40" />
      </div>
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
  const today = useMemo(() => new Date().toLocaleDateString(), []);
  const [showScreensaver, setShowScreensaver] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = window.localStorage.getItem('mxmanv.theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [lang, setLang] = useState<SupportedLang>(() => {
    const saved = window.localStorage.getItem('mxmanv.lang') as SupportedLang | null;
    return saved === 'he' || saved === 'en' ? saved : (i18n.language as SupportedLang) || 'en';
  });

  const [model, setModel] = useState<Model>(() => sampleData);
  const [dataNotice, setDataNotice] = useState<'sampleData' | null>(null);
  const [remoteNotice, setRemoteNotice] = useState<'mxFailedUsingLocal' | null>(null);
  const [dataSource, setDataSource] = useState<'mx' | 'local' | 'sample'>(() => 'local');
  const [mxUsername, setMxUsername] = useState<string | null>(null);
  const [mxAccessKey, setMxAccessKey] = useState<string | null>(null);
  const [publicData, setPublicData] = useState<PublicDataJson | null>(null);
  const [serverGroupUuid, setServerGroupUuid] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [groupsByUuid, setGroupsByUuid] = useState<Map<string, PublicGroup>>(() => new Map());
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [selectedGroupUuid, setSelectedGroupUuid] = useState<string | null>(() =>
    window.localStorage.getItem('mxmanv.group_uuid')
  );

  const [typeFilter, setTypeFilter] = useState<'both' | 'incident' | 'problem' | 'rw' | 'cw'>(() => {
    const saved = window.localStorage.getItem('mxmanv.typeFilter');
    return saved === 'incident' || saved === 'problem' || saved === 'both' || saved === 'rw' || saved === 'cw' ? saved : 'both';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    window.localStorage.setItem('mxmanv.theme', theme);
  }, [theme]);

  useEffect(() => {
    void i18n.changeLanguage(lang);
    window.localStorage.setItem('mxmanv.lang', lang);
    const root = document.documentElement;
    root.lang = lang;
    root.dir = isRtl(lang) ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    window.localStorage.setItem('mxmanv.typeFilter', typeFilter);
  }, [typeFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch username + loginUserInfo (best-effort).
        let userid: string | null = null;
        let loginInfo: MxLoginUserInfo | null = null;
        if (mxUseRemoteApi()) {
          try {
            userid = await fetchMxUsername();
          } catch {
            userid = null;
          }
          if (cancelled) return;
          setMxUsername(userid);

          if (userid) {
            try {
              loginInfo = await fetchMxLoginUserInfo(userid);
            } catch {
              loginInfo = null;
            }
            if (!cancelled) setMxAccessKey(loginInfo?.accessKey ?? null);
          } else {
            if (!cancelled) setMxAccessKey(null);
          }
        }
        if (!mxUseRemoteApi()) {
          if (!cancelled) setMxAccessKey(null);
        }

        if (mxRemoteMode() === 'all') {
          const g = loginInfo?.groups?.length
            ? loginInfo.groups.map((x) => ({ group_uuid: x.group_uuid, group_name: x.group_name }))
            : listGroups({ grpmem: [], problems: [] } as PublicDataJson);
          setGroups(g);
          setGroupsByUuid(new Map(g.map((x) => [x.group_uuid, x] as const)));

          const saved = window.localStorage.getItem('mxmanv.group_uuid');
          const initialGroup = saved && g.some((x) => x.group_uuid === saved) ? saved : g[0]?.group_uuid ?? null;
          setSelectedGroupUuid(initialGroup);

          // In server-only mode we load problems filtered by the selected group_name.
          if (initialGroup) {
            const groupName = g.find((x) => x.group_uuid === initialGroup)?.group_name;
            const [remoteProblems, rows] = await Promise.all([
              fetchMxProblems({ groupName }),
              groupName ? Promise.resolve([]) : Promise.resolve([])
            ]);
            if (cancelled) return;

            const grpmem = (rows as import('./model/fromPublicData').PublicGrpMem[])
              .filter((r) => r.group_uuid && r.member_uuid)
              .map(
                (r) =>
                  ({
                    group_uuid: String(r.group_uuid),
                    group_name: String(r.group_name || groupName || 'Team'),
                    member_uuid: String(r.member_uuid),
                    member_name: String(r.member_name || r.member_uuid),
                    inactive: typeof r.inactive === 'number' ? r.inactive : 0,
                    manager_flag: typeof r.manager_flag === 'number' ? r.manager_flag : 0
                  }) satisfies PublicGrpMem
              );

            const json = { grpmem, problems: remoteProblems as any } as PublicDataJson;
            setServerGroupUuid(initialGroup);
            setPublicData(json);
            setModel(modelFromPublicData(json, { group_uuid: initialGroup }));
          } else {
            const json = { grpmem: [], problems: [] } as PublicDataJson;
            setServerGroupUuid(null);
            setPublicData(json);
            setModel(modelFromPublicData(json));
          }
          setDataNotice(null);
          setRemoteNotice(null);
          setDataSource('mx');
          return;
        }

        const res = await fetch('/data.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PublicDataJson;
        const next = modelFromPublicData(json);
        if (cancelled) return;
        setPublicData(json);
        const g = listGroups(json);
        setGroups(g);
        setGroupsByUuid(new Map(g.map((x) => [x.group_uuid, x] as const)));

        const saved = window.localStorage.getItem('mxmanv.group_uuid');
        const initialGroup = saved && g.some((x) => x.group_uuid === saved) ? saved : g[0]?.group_uuid ?? null;
        setSelectedGroupUuid(initialGroup);
        setModel(initialGroup ? modelFromPublicData(json, { group_uuid: initialGroup }) : next);
        setDataNotice(null);
        setRemoteNotice(null);
        setDataSource('local');
      } catch {
        if (cancelled) return;
        setModel(sampleData);
        setPublicData(null);
        setGroups([]);
        setDataNotice('sampleData');
        setRemoteNotice(null);
        setDataSource('sample');
        setMxUsername(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!publicData || !selectedGroupUuid) return;
      window.localStorage.setItem('mxmanv.group_uuid', selectedGroupUuid);

      // Server-only mode: problems already loaded from MX on startup.
      // Do not flip the UI to "local" or re-fetch problems per group.
      if (mxRemoteMode() === 'all') {
        setRemoteNotice(null);
        setDataSource('mx');

        // Avoid re-fetch loops if we just updated publicData for this group.
        if (serverGroupUuid === selectedGroupUuid) {
          setModel(modelFromPublicData(publicData, { group_uuid: selectedGroupUuid }));
          return;
        }

        const groupName = groupsByUuid.get(selectedGroupUuid)?.group_name;
        if (groupName) {
          try {
            const [remoteProblems, rows] = await Promise.all([
              fetchMxProblems({ groupName }),
              Promise.resolve([])
            ]);
            if (cancelled) return;
            const grpmem = (rows as import('./model/fromPublicData').PublicGrpMem[])
              .filter((r) => r.group_uuid && r.member_uuid)
              .map(
                (r) =>
                  ({
                    group_uuid: String(r.group_uuid),
                    group_name: String(r.group_name || groupName),
                    member_uuid: String(r.member_uuid),
                    member_name: String(r.member_name || r.member_uuid),
                    inactive: typeof r.inactive === 'number' ? r.inactive : 0,
                    manager_flag: typeof r.manager_flag === 'number' ? r.manager_flag : 0
                  }) satisfies PublicGrpMem
              );

            const nextData = { ...publicData, grpmem, problems: remoteProblems as any };
            setServerGroupUuid(selectedGroupUuid);
            setPublicData(nextData);
            setModel(modelFromPublicData(nextData, { group_uuid: selectedGroupUuid }));
            return;
          } catch {
            // fall through
          }
        }

        setModel(modelFromPublicData(publicData, { group_uuid: selectedGroupUuid }));
        return;
      }

      // Default: use local problems
      let nextData: PublicDataJson = publicData;
      setRemoteNotice(null);
      setDataSource('local');

      // Optional: replace problems with remote API result
      if (mxUseRemoteApi()) {
        const groupName = groupsByUuid.get(selectedGroupUuid)?.group_name;
        if (groupName && groupName.trim().length) {
          try {
            const remoteProblems = await fetchMxProblems({ groupName });
            if (cancelled) return;
            nextData = { ...publicData, problems: remoteProblems as any };
            setDataSource('mx');
          } catch {
            // Silent fallback to local data.json
            if (cancelled) return;
            setRemoteNotice('mxFailedUsingLocal');
            setDataSource('local');
          }
        } else if (mxRemoteMode() === 'all') {
          // In server-only mode, group_name might be missing for some reason: still try active-only.
          try {
            const remoteProblems = await fetchMxProblems({});
            if (cancelled) return;
            nextData = { ...publicData, problems: remoteProblems as any };
            setDataSource('mx');
          } catch {
            if (cancelled) return;
            setRemoteNotice('mxFailedUsingLocal');
            setDataSource('local');
          }
        }
      }

      setModel(modelFromPublicData(nextData, { group_uuid: selectedGroupUuid }));
    })();

    return () => {
      cancelled = true;
    };
  }, [publicData, selectedGroupUuid, groupsByUuid, serverGroupUuid]);

  useEffect(() => {
    if (!showScreensaver) return;
    const timerId = window.setTimeout(() => setShowScreensaver(false), 3000);
    return () => window.clearTimeout(timerId);
  }, [showScreensaver]);

  const refreshSelectedTeam = async () => {
    if (refreshing) return;
    if (!selectedGroupUuid) return;
    const groupName = groupsByUuid.get(selectedGroupUuid)?.group_name;
    if (!groupName || !groupName.trim()) return;

    try {
      setRefreshing(true);
      setRemoteNotice(null);
      setDataSource('mx');

      const [remoteProblems, rows] = await Promise.all([
        fetchMxProblems({ groupName }),
        Promise.resolve([])
      ]);

      const grpmem = (rows as import('./model/fromPublicData').PublicGrpMem[])
        .filter((r) => r.group_uuid && r.member_uuid)
        .map(
          (r) =>
            ({
              group_uuid: String(r.group_uuid),
              group_name: String(r.group_name || groupName),
              member_uuid: String(r.member_uuid),
              member_name: String(r.member_name || r.member_uuid),
              inactive: typeof r.inactive === 'number' ? r.inactive : 0,
              manager_flag: typeof r.manager_flag === 'number' ? r.manager_flag : 0
            }) satisfies PublicGrpMem
        );

      if (mxRemoteMode() === 'all') {
        const nextData = { grpmem, problems: remoteProblems as any } as PublicDataJson;
        setServerGroupUuid(selectedGroupUuid);
        setPublicData(nextData);
        setModel(modelFromPublicData(nextData, { group_uuid: selectedGroupUuid }));
        return;
      }

      // Hybrid mode: refresh problems and merge grpmem for this group_name only.
      if (publicData) {
        const existing = Array.isArray(publicData.grpmem) ? publicData.grpmem : [];
        const merged = [...existing.filter((x) => x.group_name !== groupName), ...grpmem];
        const nextData = { ...publicData, grpmem: merged, problems: remoteProblems as any };
        setPublicData(nextData);
        setModel(modelFromPublicData(nextData, { group_uuid: selectedGroupUuid }));
      }
    } catch {
      if (mxRemoteMode() !== 'all') {
        setRemoteNotice('mxFailedUsingLocal');
        setDataSource('local');
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen">
      <PlaneScreensaver visible={showScreensaver} />
      <header className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/60 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/30 dark:shadow-black/20">
        <ServerUpdateBanner />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              {t('app.title')}
            </div>
            <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              {t('app.subtitle', { date: today })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/60 px-3 py-1 text-xs text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              <span className="text-slate-500 dark:text-slate-300">{t('app.langLabel')}</span>
              <div className="w-max min-w-[80px]">
                <Listbox value={lang} onChange={setLang}>
                  {() => (
                    <div className="relative w-max min-w-full">
                      <Listbox.Button className="flex w-max min-w-full items-center gap-1 bg-transparent text-xs font-semibold text-slate-900 outline-none dark:text-slate-100 px-2 py-1 rounded cursor-pointer border border-slate-200/70 dark:border-white/10 whitespace-nowrap">
                        {lang === 'en' ? (
                          <span role="img" aria-label="English" className="mr-1">🇬🇧</span>
                        ) : (
                          <span role="img" aria-label="Hebrew" className="mr-1">🇮🇱</span>
                        )}
                        <span className="whitespace-nowrap min-w-0">
                          {lang === 'en' && t('language.en')}
                          {lang === 'he' && t('language.he')}
                        </span>
                        <svg className="ml-2 h-3 w-3 text-slate-400 flex-shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M7 7l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M7 13l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Listbox.Button>
                      <Listbox.Options className="absolute z-10 mt-1 w-max min-w-full rounded bg-white dark:bg-slate-900 shadow-lg ring-1 ring-black/10 dark:ring-white/10 focus:outline-none text-xs">
                        <Listbox.Option value="en" className={({ active }) => `cursor-pointer select-none px-3 py-2 flex items-center gap-2 whitespace-nowrap ${active ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                          <span role="img" aria-label="English">🇬🇧</span> {t('language.en')}
                        </Listbox.Option>
                        <Listbox.Option value="he" className={({ active }) => `cursor-pointer select-none px-3 py-2 flex items-center gap-2 whitespace-nowrap ${active ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                          <span role="img" aria-label="Hebrew">🇮🇱</span> {t('language.he')}
                        </Listbox.Option>
                      </Listbox.Options>
                    </div>
                  )}
                </Listbox>
              </div>
            </label>

            {groups.length >= 1 ? (
              <label className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/60 px-3 py-1 text-xs text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                <span className="text-slate-500 dark:text-slate-300">{t('app.teamLabel')}</span>
                <div className="w-max min-w-[100px]">
                  {/* Color palette for team icons */}
                  {(() => {
                    const teamColors = [
                      'text-blue-500',
                      'text-green-500',
                      'text-amber-500',
                      'text-pink-500',
                      'text-purple-500',
                      'text-cyan-500',
                      'text-red-500',
                      'text-lime-500',
                      'text-fuchsia-500',
                      'text-orange-500',
                    ];
                    return (
                      <Listbox value={selectedGroupUuid ?? ''} onChange={setSelectedGroupUuid}>
                        {() => {
                          const selectedIdx = groups.findIndex((g) => g.group_uuid === selectedGroupUuid);
                          const selectedColor = teamColors[selectedIdx % teamColors.length] || 'text-blue-500';
                          return (
                            <div className="relative w-max min-w-full">
                              <Listbox.Button className="flex w-max min-w-full items-center gap-1 bg-transparent text-xs font-semibold text-slate-900 outline-none dark:text-slate-100 px-2 py-1 rounded cursor-pointer border border-slate-200/70 dark:border-white/10 whitespace-nowrap">
                                <span className={`mr-1 ${selectedColor}`} aria-label="Team">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="inline align-middle">
                                    <circle cx="7" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
                                    <circle cx="17" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
                                    <ellipse cx="7" cy="16" rx="5" ry="3" stroke="currentColor" strokeWidth="1.5" />
                                    <ellipse cx="17" cy="16" rx="5" ry="3" stroke="currentColor" strokeWidth="1.5" />
                                  </svg>
                                </span>
                                <span className="whitespace-nowrap min-w-0">
                                  {groups.find((g) => g.group_uuid === selectedGroupUuid)?.group_name || ''}
                                </span>
                                <svg className="ml-2 h-3 w-3 text-slate-400 flex-shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                  <path d="M7 7l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M7 13l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </Listbox.Button>
                              <Listbox.Options className="absolute z-10 mt-1 w-max min-w-full rounded bg-white dark:bg-slate-900 shadow-lg ring-1 ring-black/10 dark:ring-white/10 focus:outline-none text-xs">
                                {groups.map((g, idx) => (
                                  <Listbox.Option key={g.group_uuid} value={g.group_uuid} className={({ active }) => `cursor-pointer select-none px-3 py-2 flex items-center gap-2 whitespace-nowrap ${active ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                                    <span className={`${teamColors[idx % teamColors.length]}`} aria-label="Team">
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="inline align-middle">
                                        <circle cx="7" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
                                        <circle cx="17" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
                                        <ellipse cx="7" cy="16" rx="5" ry="3" stroke="currentColor" strokeWidth="1.5" />
                                        <ellipse cx="17" cy="16" rx="5" ry="3" stroke="currentColor" strokeWidth="1.5" />
                                      </svg>
                                    </span> {g.group_name}
                                  </Listbox.Option>
                                ))}
                              </Listbox.Options>
                            </div>
                          );
                        }}
                      </Listbox>
                    );
                  })()}
                </div>
              </label>
            ) : null}

            <label className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/60 px-3 py-1 text-xs text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              <span className="text-slate-500 dark:text-slate-300">{t('app.typeFilterLabel')}</span>
              <div className="w-max min-w-[120px]">
                <Listbox value={typeFilter} onChange={setTypeFilter}>
                  {() => (
                    <div className="relative w-max min-w-full">
                      <Listbox.Button className="flex w-max min-w-full items-center gap-1 bg-transparent text-xs font-semibold text-slate-900 outline-none dark:text-slate-100 px-2 py-1 rounded cursor-pointer border border-slate-200/70 dark:border-white/10 whitespace-nowrap">
                        <ProblemTypeIcon type={typeFilter} />
                        <span className="whitespace-nowrap min-w-0">
                          {typeFilter === 'incident' && t('app.typeFilterIncident')}
                          {typeFilter === 'problem' && t('app.typeFilterProblem')}
                          {typeFilter === 'rw' && t('app.typeFilterRW')}
                          {typeFilter === 'cw' && t('app.typeFilterCW')}
                          {typeFilter === 'both' && t('app.typeFilterAll')}
                        </span>
                        <svg className="ml-2 h-3 w-3 text-slate-400 flex-shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M7 7l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M7 13l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Listbox.Button>
                      <Listbox.Options className="absolute z-10 mt-1 w-max min-w-full rounded bg-white dark:bg-slate-900 shadow-lg ring-1 ring-black/10 dark:ring-white/10 focus:outline-none text-xs">
                        <Listbox.Option value="incident" className={({ active }) => `cursor-pointer select-none px-3 py-2 flex items-center gap-2 whitespace-nowrap ${active ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                          <ProblemTypeIcon type="incident" /> {t('app.typeFilterIncident')}
                        </Listbox.Option>
                        <Listbox.Option value="problem" className={({ active }) => `cursor-pointer select-none px-3 py-2 flex items-center gap-2 whitespace-nowrap ${active ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                          <ProblemTypeIcon type="problem" /> {t('app.typeFilterProblem')}
                        </Listbox.Option>
                        <Listbox.Option value="rw" className={({ active }) => `cursor-pointer select-none px-3 py-2 flex items-center gap-2 whitespace-nowrap ${active ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                          <ProblemTypeIcon type="rw" /> {t('app.typeFilterRW')}
                        </Listbox.Option>
                        <Listbox.Option value="cw" className={({ active }) => `cursor-pointer select-none px-3 py-2 flex items-center gap-2 whitespace-nowrap ${active ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                          <ProblemTypeIcon type="cw" /> {t('app.typeFilterCW')}
                        </Listbox.Option>
                        <Listbox.Option value="both" className={({ active }) => `cursor-pointer select-none px-3 py-2 flex items-center gap-2 whitespace-nowrap ${active ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                          <ProblemTypeIcon type="both" /> {t('app.typeFilterAll')}
                        </Listbox.Option>
                      </Listbox.Options>
                    </div>
                  )}
                </Listbox>
              </div>
            </label>

            <div
              className="hidden rounded-full border border-slate-200/70 bg-white/60 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200 sm:block"
              title={
                dataSource === 'mx'
                  ? t('app.dataSourceMxTitle')
                  : dataSource === 'sample'
                    ? t('app.dataSourceSampleTitle')
                    : t('app.dataSourceLocalTitle')
              }
            >
              {t('app.dataSourceLabel')}: {dataSource === 'mx' ? t('app.dataSourceMx') : dataSource === 'sample' ? t('app.dataSourceSample') : t('app.dataSourceLocal')}
            </div>

            {mxUsername ? (
              <div
                className="hidden rounded-full border border-slate-200/70 bg-white/60 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200 sm:block"
                title={t('app.userTitle')}
              >
                {t('app.userLabel')}: {mxUsername}
              </div>
            ) : null}

            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/60 text-slate-900 shadow-sm backdrop-blur hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-black/20 dark:hover:bg-white/10"
              onClick={refreshSelectedTeam}
              disabled={refreshing || !selectedGroupUuid}
              aria-label={t('app.refresh')}
              title={t('app.refreshTitle')}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                <path
                  d="M20 12a8 8 0 0 1-14.9 4M4 12a8 8 0 0 1 14.9-4"
                  className="stroke-current"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M18.5 5.5v4h-4M5.5 18.5v-4h4"
                  className="stroke-current"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/60 text-slate-900 shadow-sm backdrop-blur hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-black/20 dark:hover:bg-white/10"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? t('app.themeSwitchToLight') : t('app.themeSwitchToDark')}
              title={theme === 'dark' ? t('app.themeSwitchToLight') : t('app.themeSwitchToDark')}
            >
              {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                  <path
                    d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
                    className="stroke-current"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M12 2.75v2.2M12 19.05v2.2M4.22 4.22l1.55 1.55M18.23 18.23l1.55 1.55M2.75 12h2.2M19.05 12h2.2M4.22 19.78l1.55-1.55M18.23 5.77l1.55-1.55"
                    className="stroke-current"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                  <path
                    d="M21 14.2A7.6 7.6 0 0 1 9.8 3a6.8 6.8 0 1 0 11.2 11.2Z"
                    className="stroke-current"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {dataNotice ? (
          <div className="mb-4 rounded-2xl border border-amber-200/70 bg-white/60 px-4 py-3 text-sm text-amber-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:shadow-black/20">
            {dataNotice === 'sampleData' ? t('app.usingSampleData') : dataNotice}
          </div>
        ) : null}
        {remoteNotice ? (
          <div className="mb-4 rounded-2xl border border-amber-200/70 bg-white/60 px-4 py-3 text-sm text-amber-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:shadow-black/20">
            {remoteNotice === 'mxFailedUsingLocal' ? t('app.mxFailedUsingLocal') : remoteNotice}
          </div>
        ) : null}
        <Board model={model} typeFilter={typeFilter} mxAccessKey={mxAccessKey} serverUpdatesEnabled={mxUseRemoteApi()} />
      </main>

      <footer className="border-t border-slate-200/60 bg-white/40 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/20">
        <div className="mx-auto max-w-7xl px-4 py-4 text-center text-xs text-slate-600 dark:text-slate-300">
          Mx Manager View System  Author: Michael Khokhlinov 2025
        </div>
      </footer>
    </div>
  );
}
