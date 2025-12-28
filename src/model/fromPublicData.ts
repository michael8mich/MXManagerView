import type { AllowedMove, Employee, Lane, Model, OwnerRef, Problem, ProblemStatus, Priority } from './types';

export type PublicGrpMem = {
  group_uuid: string;
  group_name: string;
  member_uuid: string;
  member_name: string;
  inactive?: number;
  manager_flag?: number;
};

type PublicProblem = {
  id: number;
  ref_num?: string;
  summary?: string;
  description?: string;
  status?: string;
  status_name?: string;
  open_date?: number | null;
  category_name?: string | null;
  customer_name?: string | null;
  attmnts?: number | null;
  wfs?: number | null;
  group_id?: string | number | null;
  group_name?: string | null;
  assignee_id?: string | number | null;
  assignee_name?: string | null;
  priority?: number | null;
  type?: string | null;
  last_mod_dt?: number | null;
  last_mod_by_name?: string | null;
  category_name_first?: string | null;
  asset_name?: string | null;
};

export type PublicDataJson = {
  grpmem: PublicGrpMem[];
  problems: PublicProblem[];
};

export type PublicGroup = { group_uuid: string; group_name: string };

function uniqBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function normName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function toId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function isTeamQueueAssignee(assigneeName: string | null | undefined, teamName: string): boolean {
  const a = assigneeName ? normName(String(assigneeName)) : '';
  const t = normName(teamName);
  return !!a && !!t && a === t;
}

function pickPrimaryGroup(grpmem: PublicGrpMem[]): { group_uuid: string; group_name: string } {
  const counts = new Map<string, { group_uuid: string; group_name: string; count: number }>();
  for (const gm of grpmem) {
    const id = gm.group_uuid;
    if (!id) continue;
    const entry = counts.get(id);
    if (entry) {
      entry.count += 1;
      // Keep latest group_name in case it changes.
      entry.group_name = gm.group_name || entry.group_name;
    } else {
      counts.set(id, { group_uuid: id, group_name: gm.group_name || 'Team', count: 1 });
    }
  }

  let best: { group_uuid: string; group_name: string; count: number } | null = null;
  for (const v of counts.values()) {
    if (!best || v.count > best.count) best = v;
  }

  if (best) return { group_uuid: best.group_uuid, group_name: best.group_name };
  return { group_uuid: 'team-1', group_name: 'Team' };
}

export function listGroups(data: PublicDataJson): PublicGroup[] {
  const grpmem = Array.isArray(data.grpmem) ? data.grpmem : [];
  const fromGrpMem = uniqBy(
    grpmem
      .filter((gm) => gm && gm.group_uuid)
      .map((gm) => ({ group_uuid: gm.group_uuid, group_name: gm.group_name || 'Team' })),
    (g) => g.group_uuid
  );

  if (fromGrpMem.length) {
    fromGrpMem.sort((a, b) => a.group_name.localeCompare(b.group_name));
    return fromGrpMem;
  }

  // Fallback: derive groups from problems when grpmem is unavailable (server-only mode).
  const problems = Array.isArray(data.problems) ? data.problems : [];
  const fromProblems = uniqBy(
    problems
      .filter((p) => p && (p.group_id || p.group_name))
      .map((p) => ({
        group_uuid: String(toId(p.group_id) || p.group_name || 'Team'),
        group_name: String(p.group_name || toId(p.group_id) || 'Team')
      })),
    (g) => g.group_uuid
  );

  fromProblems.sort((a, b) => a.group_name.localeCompare(b.group_name));
  return fromProblems;
}

function pickPrimaryGroupFromProblems(problems: PublicProblem[]): { group_uuid: string; group_name: string } {
  const counts = new Map<string, { group_uuid: string; group_name: string; count: number }>();
  for (const p of problems) {
    if (!p) continue;
    const id = String(toId(p.group_id) || p.group_name || 'Team');
    const name = String(p.group_name || toId(p.group_id) || 'Team');
    const entry = counts.get(id);
    if (entry) {
      entry.count += 1;
      if (name) entry.group_name = name;
    } else {
      counts.set(id, { group_uuid: id, group_name: name || 'Team', count: 1 });
    }
  }

  let best: { group_uuid: string; group_name: string; count: number } | null = null;
  for (const v of counts.values()) {
    if (!best || v.count > best.count) best = v;
  }

  if (best) return { group_uuid: best.group_uuid, group_name: best.group_name };
  return { group_uuid: 'team-1', group_name: 'Team' };
}

function mapPriority(priorityRaw: number | null | undefined): Priority {
  const n = typeof priorityRaw === 'number' ? priorityRaw : 0;
  // Conservative mapping: 0/unknown => lowest.
  if (n >= 3) return 'P0';
  if (n === 2) return 'P1';
  if (n === 1) return 'P2';
  return 'P3';
}

function mapStatus(statusCodeRaw: string | null | undefined, statusNameRaw: string | null | undefined): ProblemStatus {
  const code = (statusCodeRaw || '').toUpperCase();
  const name = (statusNameRaw || '').toLowerCase();

  // Try to map by common CA Service Desk-ish codes.
  if (code === 'OP' || name.includes('open')) return 'open';
  if (code === 'FIP' || name.includes('progress') || name.includes('research')) return 'in_progress';
  if (code === 'RSCH') return 'in_progress';
  if (code === 'HOLD' || code === 'HLD' || name.includes('blocked') || name.includes('hold')) return 'blocked';
  if (code === 'CL' || code === 'CLS' || name.includes('closed') || name.includes('done') || name.includes('resolved')) return 'done';

  return 'open';
}

function toIsoFromEpochSeconds(epochSeconds: number | null | undefined): string {
  if (!epochSeconds || typeof epochSeconds !== 'number') return new Date().toISOString();
  return new Date(epochSeconds * 1000).toISOString();
}

function safeTitle(p: PublicProblem): string {
  const ref = p.ref_num ? `#${p.ref_num}` : `#${p.id}`;
  const base = (p.category_name_first || p.summary || p.description || '').trim();
  const trimmed = base.length > 0 ? base : 'Problem';
  const oneLine = trimmed.replace(/\s+/g, ' ').trim();
  const short = oneLine.length > 80 ? `${oneLine.slice(0, 77)}…` : oneLine;
  return `${ref} ${short}`;
}

function buildTags(p: PublicProblem): string[] {
  const tags: string[] = [];
  if (p.type) tags.push(String(p.type).toLowerCase());
  if (p.asset_name) tags.push(String(p.asset_name));
  // Keep tags compact.
  return tags.slice(0, 3);
}

function safeDescription(p: PublicProblem): string | undefined {
  const raw = String(p.description || p.summary || '');
  // Treat whitespace-only as missing, but preserve original whitespace when showing.
  if (!raw.trim()) return undefined;
  // Keep tooltips reasonably sized.
  return raw.length > 800 ? `${raw.slice(0, 797)}…` : raw;
}

function safeCategoryFullName(p: PublicProblem): string | undefined {
  const raw = String(p.category_name ?? '').trim();
  return raw.length ? raw : undefined;
}

function safeCustomerName(p: PublicProblem): string | undefined {
  const raw = String(p.customer_name ?? '').trim();
  return raw.length ? raw : undefined;
}

function safeAssetName(p: PublicProblem): string | undefined {
  const raw = String(p.asset_name ?? '').trim();
  return raw.length ? raw : undefined;
}

export function modelFromPublicData(
  data: PublicDataJson,
  options?: { group_uuid?: string }
): Model {
  const allGrpMem = Array.isArray(data.grpmem) ? data.grpmem : [];
  const preferred = options?.group_uuid
    ? allGrpMem.find((gm) => gm.group_uuid === options.group_uuid)
    : undefined;

  const problemsAll = Array.isArray(data.problems) ? data.problems : [];

  const primary = (() => {
    if (preferred) return { group_uuid: preferred.group_uuid, group_name: preferred.group_name || 'Team' };
    if (options?.group_uuid) {
      const match = problemsAll.find(
        (p) => p && (toId(p.group_id) === options.group_uuid || p.group_name === options.group_uuid)
      );
      if (match) {
        return {
          group_uuid: String(toId(match.group_id) || options.group_uuid),
          group_name: String(match.group_name || 'Team')
        };
      }
      return { group_uuid: options.group_uuid, group_name: 'Team' };
    }
    return allGrpMem.length ? pickPrimaryGroup(allGrpMem) : pickPrimaryGroupFromProblems(problemsAll);
  })();

  const membersInGroup = allGrpMem.filter((gm) => gm && gm.group_uuid === primary.group_uuid);
  const memberByUuid = new Map<string, PublicGrpMem>();
  for (const gm of membersInGroup) {
    if (!gm.member_uuid) continue;
    if (!memberByUuid.has(gm.member_uuid)) memberByUuid.set(gm.member_uuid, gm);
  }

  const problemsForGroup = problemsAll.filter((p) => {
    if (!p) return false;
    const gid = toId(p.group_id);
    if (gid && gid === primary.group_uuid) return true;
    if (!p.group_id && p.group_name && p.group_name === primary.group_name) return true;
    if (!p.group_id && !p.group_name) return true;
    return false;
  });

  const referencedAssigneeIds = new Set<string>();
  const assigneeNameById = new Map<string, string>();
  for (const p of problemsForGroup) {
    const aid = toId(p.assignee_id);
    if (aid) referencedAssigneeIds.add(aid);
    if (aid && p.assignee_name && !isTeamQueueAssignee(p.assignee_name, primary.group_name)) {
      assigneeNameById.set(aid, String(p.assignee_name));
    }
  }

  const includedMemberUuids = new Set<string>();
  for (const gm of memberByUuid.values()) {
    const inactive = (gm.inactive ?? 0) !== 0;
    if (!inactive) includedMemberUuids.add(gm.member_uuid);
  }
  for (const id of referencedAssigneeIds) includedMemberUuids.add(id);

  const baseMembers = Array.from(includedMemberUuids)
    .map((uuid) => memberByUuid.get(uuid))
    .filter(Boolean) as PublicGrpMem[];

  const uniqueMembers = uniqBy(baseMembers, (gm) => gm.member_uuid);

  const employees: Employee[] = uniqueMembers.map((gm, idx) => ({
    id: gm.member_uuid,
    name: gm.member_name,
    role: gm.manager_flag === 1 || idx === 0 ? 'manager' : 'employee',
    teamId: primary.group_uuid
  }));

  // If a problem references an assignee_id that is not present in grpmem,
  // still create an employee lane for it (using the real member_uuid).
  const employeeByIdInit = new Set(employees.map((e) => e.id));
  for (const uuid of includedMemberUuids) {
    if (employeeByIdInit.has(uuid)) continue;
    const name = memberByUuid.get(uuid)?.member_name ?? assigneeNameById.get(uuid) ?? uuid;
    employees.push({ id: uuid, name, role: 'employee', teamId: primary.group_uuid });
    employeeByIdInit.add(uuid);
  }

  // Ensure there is at least one manager.
  if (employees.length && !employees.some((e) => e.role === 'manager')) {
    employees[0] = { ...employees[0], role: 'manager' };
  }

  const managerId = employees.find((e) => e.role === 'manager')?.id ?? employees[0]?.id ?? 'manager';

  const lanes: Lane[] = [
    { id: 'lane-team', title: primary.group_name, assigneeType: 'team', assigneeId: primary.group_uuid },
    ...employees.map((e) => ({
      id: `lane-emp-${e.id}`,
      title: e.name,
      assigneeType: 'employee' as const,
      assigneeId: e.id
    }))
  ];

  const employeeById = new Map(employees.map((e) => [e.id, e] as const));
  const employeeByName = new Map(employees.map((e) => [normName(e.name), e] as const));

  const problems: Problem[] = problemsForGroup
    .map((p) => {
      const id = `cr-${p.id}`;

      const status = mapStatus(p.status ?? null, p.status_name ?? null);
      const priority = mapPriority(p.priority ?? 0);

      let owner: OwnerRef = { type: 'team', id: primary.group_uuid };
      let currentLaneId = 'lane-team';

      const isTeamQueue =
        (toId(p.assignee_id) && toId(p.assignee_id) === primary.group_uuid) ||
        isTeamQueueAssignee(p.assignee_name, primary.group_name);

      const emp = isTeamQueue
        ? undefined
        : (toId(p.assignee_id) ? employeeById.get(toId(p.assignee_id) as string) : undefined) ??
          (p.assignee_name ? employeeByName.get(normName(p.assignee_name)) : undefined);

      if (emp) {
        owner = { type: 'employee', id: emp.id };
        currentLaneId = `lane-emp-${emp.id}`;
      }

      const createdAt = toIsoFromEpochSeconds(p.open_date ?? null);
      const openedAtEpochSeconds = typeof p.open_date === 'number' ? p.open_date : undefined;

      const problemType = typeof p.type === 'string' && p.type.trim().length ? p.type.trim().toUpperCase() : undefined;

      const attachmentsCount = typeof p.attmnts === 'number' && Number.isFinite(p.attmnts) ? Math.max(0, p.attmnts) : 0;

      const workflowsCount = typeof p.wfs === 'number' && Number.isFinite(p.wfs) ? Math.max(0, p.wfs) : 0;

      const lastModifiedAtEpochSeconds = typeof p.last_mod_dt === 'number' ? p.last_mod_dt : undefined;
      const lastModifiedAtIso = typeof lastModifiedAtEpochSeconds === 'number'
        ? toIsoFromEpochSeconds(lastModifiedAtEpochSeconds)
        : undefined;
      const lastModifiedByName = typeof p.last_mod_by_name === 'string' && p.last_mod_by_name.trim().length
        ? p.last_mod_by_name.trim()
        : undefined;

      const created: Problem = {
        id,
        recordNumber: typeof p.id === 'number' && Number.isFinite(p.id) ? p.id : undefined,
        title: safeTitle(p),
        priority,
        problemType,
        attachmentsCount,
        workflowsCount,
        assetName: safeAssetName(p),
        status,
        statusLabel: p.status_name ?? undefined,
        description: safeDescription(p),
        openedAtEpochSeconds,
        openedAtIso: createdAt,
        lastModifiedAtEpochSeconds,
        lastModifiedAtIso,
        lastModifiedByName,
        categoryFullName: safeCategoryFullName(p),
        customerName: safeCustomerName(p),
        owner,
        currentLaneId,
        tags: buildTags(p),
        history: [
          {
            at: createdAt,
            action: 'created',
            by: managerId,
            from: null,
            to: owner
          }
        ]
      };

      return created;
    });

  const allowedMoves: AllowedMove[] = [
    { fromType: 'employee', toType: 'employee' },
    { fromType: 'employee', toType: 'team' },
    { fromType: 'team', toType: 'employee' }
  ];

  return {
    org: {
      team: { id: primary.group_uuid, name: primary.group_name, managerId },
      employees
    },
    boards: [
      {
        id: 'board-1',
        name: 'Problems',
        lanes
      }
    ],
    problems,
    allowedMoves
  };
}
