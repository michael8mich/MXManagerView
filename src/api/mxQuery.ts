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
  accesskey?: string;
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
  accessKey?: string;
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

function extractAccessKeyFromRows(rows: Array<Record<string, unknown>>): string | undefined {
  const preferred = new Set(['xkey', 'x-accesskey', 'x_accesskey', 'xaccesskey', 'accesskey']);

  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      const key = k.trim().toLowerCase();
      if (!preferred.has(key)) continue;
      const s = asString(v);
      if (s) return s;
    }
  }

  // Fallback: any key that contains "xkey" or "accesskey".
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      const key = k.trim().toLowerCase();
      if (!key.includes('xkey') && !key.includes('accesskey')) continue;
      const s = asString(v);
      if (s) return s;
    }
  }

  return undefined;
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
    __F__: 'V_mxmanv_all',
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
  const accessKey = extractAccessKeyFromRows(rows as any);

  return {
    userid: user,
    count,
    rows,
    groups,
    memberUuid,
    memberName,
    accessKey
  };
}

function normalizeMxUserId(value: string): string {
  const raw = value.trim();
  if (!raw.length) return raw;
  // Expected by MX REST: U'<...>'
  if (/^U'.*'$/.test(raw)) return raw;

  const stripped = raw.replace(/^U'/, '').replace(/'$/, '').trim();

  // Common UUID-ish / handle formats.
  const looksHex32 = /^[0-9a-f]{32}$/i.test(stripped);
  const looksGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stripped);
  if (looksHex32 || looksGuid) return `U'${stripped}'`;

  // Fallback: still wrap whatever we got.
  return `U'${stripped}'`;
}

function normalizeCrId(value: string | number): string {
  const raw = String(value).trim();
  // Some sources provide ids like "cr-401103" or "cr:401103".
  return raw.replace(/^cr\s*[-:]/i, '').trim();
}

// Unified CR ID type for both RW and CW (no type field)
export type MxCrId = {
  id: string;
  wf_id?: string | number; // Only for RW
  type?: 'CW' | 'RW'; // Only for RW
};

export async function updateMxCrAssignee(params: {

  crId: MxCrId | string ;
  accessKey: string;
  assigneeUserUuid: string | null;
}): Promise<unknown> {
  const base = envString('VITE_MX_WEBAPP_PROXY_URL', '/MXWebAppProxy');
  let url: string;
  let payload: any;
  const { crId, accessKey, assigneeUserUuid } = params;
  if(typeof crId !== "string") {

  const { id, wf_id, type } = crId;
  
  
 
  if (wf_id !== undefined && wf_id !== null) {
    // RW type (workflow)
    let server_side_object_type = 'cr_wf';
    if(type === "CW")
      server_side_object_type = "wf"

    url = `${base.replace(/\/+$|$/, '')}/${server_side_object_type}/${encodeURIComponent(String(wf_id))}`;
    
    
    const assignee = assigneeUserUuid?.trim() ?? '';
    if (assignee && /^name:/i.test(assignee)) {
      throw new Error('MX Update requires member_uuid (got name-based assignee)');
    }
    payload = assignee
      ? {
          [server_side_object_type]: {
            assignee: {
              '@id': normalizeMxUserId(assignee)
            }
          }
        }
      : {
          [server_side_object_type]: {
            assignee: 'NULL'
          }
        };
  }} else if (crId) {

    // CW type (no workflow)
    url = `${base.replace(/\/+$|$/, '')}/cr/${encodeURIComponent(normalizeCrId(crId))}`;
    const assignee = assigneeUserUuid?.trim() ?? '';
    if (assignee && /^name:/i.test(assignee)) {
      throw new Error('MX Update requires member_uuid (got name-based assignee)');
    }
    payload = assignee
      ? {
          cr: {
            assignee: {
              '@id': normalizeMxUserId(assignee)
            }
          }
        }
      : {
          cr: {
            assignee: 'NULL'
          }
        };
  } else {
    throw new Error('Invalid crId: missing id');
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      accept: '*/*',
      'Content-Type': 'application/json',
      'x-accesskey': accessKey
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MX Update HTTP ${res.status}${text ? `: ${text}` : ''}`);
  }

  return res.json().catch(() => null);
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
