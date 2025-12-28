export type MxQueryResponse = {
  count?: number;
  problems?: unknown;
  results?: unknown;
  result?: unknown;
};

export type MxUsernameResponse = {
  username?: string;
};

export type MxLoginUserRow = {
  userid?: string;
  uuid?: string;
  xkey?: string;
  group_uuid?: string;
  group_name?: string;
  member_name?: string;
  member_uuid?: string;
  inactive?: number;
};

export type MxLoginUserInfo = {
  userid: string;
  count: number;
  rows: MxLoginUserRow[];
  groups: Array<{ group_uuid: string; group_name: string; inactive: boolean }>;
  memberUuid?: string;
  memberName?: string;
};

export type MxGroupMemberRow = {
  group_uuid?: string;
  group_name?: string;
  member_uuid?: string;
  member_name?: string;
  inactive?: number;
  manager_flag?: number;
};

export type MxRemoteMode = 'off' | 'problems' | 'all';

function envBool(key: string, fallback: boolean): boolean {
  const raw = (import.meta as any).env?.[key];
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;
  }
  return fallback;
}

function envString(key: string, fallback: string): string {
  const v = (import.meta as any).env?.[key];
  return typeof v === 'string' && v.trim().length ? v.trim() : fallback;
}

function envNumber(key: string, fallback: number): number {
  const raw = (import.meta as any).env?.[key];
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

export function mxUseRemoteApi(): boolean {
  return mxRemoteMode() !== 'off';
}

export function mxRemoteMode(): MxRemoteMode {
  const raw = (import.meta as any).env?.VITE_MX_USE_REMOTE_API;
  if (raw === true) return 'problems';
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (v === 'all') return 'all';
    if (v === 'problems' || v === '1' || v === 'true' || v === 'yes' || v === 'on') return 'problems';
    return 'off';
  }
  return 'off';
}

export async function fetchMxProblems(params: { groupName?: string }): Promise<any[]> {
  const url = envString('VITE_MX_QUERY_URL', '/mxssddql/Query');
  const pageSize = envNumber('VITE_MX_PAGE_SIZE', 500);

  const where: Record<string, string> = { active: '1' };
  if (params.groupName && params.groupName.trim().length) where.group_name = params.groupName;

  const body = {
    __F__: 'v_cr',
    __S__: '*',
    __PS__: pageSize,
    __O__: ['id'],
    __W__: where
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`MX Query HTTP ${res.status}`);

  const json = (await res.json()) as MxQueryResponse;

  // Dev-only helper: pause exactly when server data arrives.
  // Enable with: VITE_MX_DEBUG_ON_FETCH=true
  if (envBool('VITE_MX_DEBUG_ON_FETCH', false)) {
    // eslint-disable-next-line no-debugger
    debugger;
  }

  // Common shapes: { problems: [...] } or { results: [...] } or { result: [...] }
  const problems = asArray((json as any)?.problems);
  if (problems) return problems as any[];

  const results = asArray((json as any)?.results);
  if (results) return results as any[];

  // Alternate: { result: [...] }
  const result = asArray((json as any)?.result);
  if (result) return result as any[];

  throw new Error('MX Query response missing problems array');
}

export async function fetchMxUsername(): Promise<string | null> {
  const queryUrl = envString('VITE_MX_QUERY_URL', '/mxssddql/Query');
  const url = `${queryUrl.replace(/\/+$/, '')}/username`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      accept: '*/*'
    },
    body: ''
  });

  if (!res.ok) throw new Error(`MX Username HTTP ${res.status}`);
  const json = (await res.json()) as MxUsernameResponse;
  const raw = typeof json?.username === 'string' ? json.username.trim() : '';
  if (!raw.length) return null;

  // Normalize common Windows/MX forms:
  // - DOMAIN\\user -> user
  // - DOMAIN/user  -> user
  // - user@domain  -> user
  const lastSlash = Math.max(raw.lastIndexOf('\\'), raw.lastIndexOf('/'));
  const noDomain = lastSlash >= 0 ? raw.slice(lastSlash + 1) : raw;
  const at = noDomain.indexOf('@');
  const normalized = (at >= 0 ? noDomain.slice(0, at) : noDomain).trim();

  return normalized.length ? normalized : null;
}

export async function fetchMxLoginUserInfo(userid: string): Promise<MxLoginUserInfo | null> {
  const user = userid.trim();
  if (!user.length) return null;

  const url = envString('VITE_MX_QUERY_URL', '/mxssddql/Query');
  const pageSize = envNumber('VITE_MX_PAGE_SIZE', 500);

  const body = {
    __F__: 'V_mxmanagerview',
    __S__: '*',
    __PS__: pageSize,
    __O__: ['userid'],
    __W__: { userid: user }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`MX LoginUserInfo HTTP ${res.status}`);
  const json = (await res.json()) as MxQueryResponse;

  const rowsRaw =
    asArray((json as any)?.results) ?? asArray((json as any)?.result) ?? asArray((json as any)?.problems) ?? [];

  const rows = rowsRaw
    .filter((r) => r && typeof r === 'object')
    .map((r) => r as MxLoginUserRow);

  const groupsMap = new Map<string, { group_uuid: string; group_name: string; inactive: boolean }>();
  for (const r of rows) {
    const group_uuid = asString((r as any)?.group_uuid);
    if (!group_uuid) continue;
    const group_name = asString((r as any)?.group_name) ?? group_uuid;
    const inactive = Number((r as any)?.inactive ?? 0) !== 0;
    if (!groupsMap.has(group_uuid)) groupsMap.set(group_uuid, { group_uuid, group_name, inactive });
  }

  const groups = Array.from(groupsMap.values()).sort((a, b) => a.group_name.localeCompare(b.group_name));
  const count = typeof (json as any)?.count === 'number' ? (json as any).count : rows.length;
  const memberUuid = asString((rows[0] as any)?.member_uuid) ?? asString((rows[0] as any)?.uuid) ?? undefined;
  const memberName = asString((rows[0] as any)?.member_name) ?? undefined;

  return {
    userid: user,
    count,
    rows,
    groups,
    memberUuid,
    memberName
  };
}

export async function fetchMxGroupMembers(groupName: string): Promise<MxGroupMemberRow[]> {
  const g = groupName.trim();
  if (!g.length) return [];

  const url = envString('VITE_MX_QUERY_URL', '/mxssddql/Query');
  const pageSize = envNumber('VITE_MX_PAGE_SIZE', 500);

  const body = {
    __F__: 'V_grpmem',
    __S__: '*',
    __PS__: pageSize,
    __O__: ['group_name'],
    __W__: { group_name: g }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`MX GroupMembers HTTP ${res.status}`);
  const json = (await res.json()) as MxQueryResponse;

  const rowsRaw =
    asArray((json as any)?.results) ?? asArray((json as any)?.result) ?? asArray((json as any)?.problems) ?? [];

  return rowsRaw
    .filter((r) => r && typeof r === 'object')
    .map((r) => r as MxGroupMemberRow);
}
