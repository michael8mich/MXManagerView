import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Board from './board/Board';
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
  fetchMxGroupMembers,
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
    const candidates = [
      '/screensaver-plane.jpg',
      '/screensaver-plane.jpeg',
      '/screensaver-plane.png',
      '/screensaver-plane.webp'
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
    })();

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
  const [publicData, setPublicData] = useState<PublicDataJson | null>(null);
  const [serverGroupUuid, setServerGroupUuid] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [groupsByUuid, setGroupsByUuid] = useState<Map<string, PublicGroup>>(() => new Map());
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [selectedGroupUuid, setSelectedGroupUuid] = useState<string | null>(() =>
    window.localStorage.getItem('mxmanv.group_uuid')
  );

  const [typeFilter, setTypeFilter] = useState<'both' | 'incident' | 'problem'>(() => {
    const saved = window.localStorage.getItem('mxmanv.typeFilter');
    return saved === 'incident' || saved === 'problem' || saved === 'both' ? saved : 'both';
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
          }
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
              groupName ? fetchMxGroupMembers(groupName) : Promise.resolve([])
            ]);
            if (cancelled) return;

            const grpmem = rows
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
              fetchMxGroupMembers(groupName)
            ]);
            if (cancelled) return;
            const grpmem = rows
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
        fetchMxGroupMembers(groupName)
      ]);

      const grpmem = rows
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
              <select
                className="bg-transparent text-xs font-semibold text-slate-900 outline-none dark:text-slate-100"
                value={lang}
                onChange={(e) => setLang(e.target.value as SupportedLang)}
              >
                <option value="en">{t('language.en')}</option>
                <option value="he">{t('language.he')}</option>
              </select>
            </label>

            {groups.length >= 1 ? (
              <label className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/60 px-3 py-1 text-xs text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                <span className="text-slate-500 dark:text-slate-300">{t('app.teamLabel')}</span>
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

            <label className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/60 px-3 py-1 text-xs text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              <span className="text-slate-500 dark:text-slate-300">{t('app.typeFilterLabel')}</span>
              <select
                className="bg-transparent text-xs font-semibold text-slate-900 outline-none dark:text-slate-100"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'both' | 'incident' | 'problem')}
              >
                <option value="incident">{t('app.typeFilterIncident')}</option>
                <option value="problem">{t('app.typeFilterProblem')}</option>
                <option value="both">{t('app.typeFilterBoth')}</option>
              </select>
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
        <Board model={model} typeFilter={typeFilter} />
      </main>

      <footer className="border-t border-slate-200/60 bg-white/40 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/20">
        <div className="mx-auto max-w-7xl px-4 py-4 text-center text-xs text-slate-600 dark:text-slate-300">
          Mx Manager View System  Author: Michael Khokhlinov 2025
        </div>
      </footer>
    </div>
  );
}
