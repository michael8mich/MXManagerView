export type OwnerType = 'team' | 'employee';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type ProblemStatus = 'open' | 'in_progress' | 'blocked' | 'done';

export interface OwnerRef {
  type: OwnerType;
  id: string;
}

export interface ProblemHistoryEntry {
  at: string;
  action: 'created' | 'assigned' | 'redirected' | 'returned' | 'moved';
  by: string;
  from: OwnerRef | null;
  to: OwnerRef;
}

export interface Problem {
  id: string;
  wf_id?: string | number;
  recordNumber?: number;
  sequence?: number;
  title: string;
  priority: Priority;
  problemType?: string;
  attachmentsCount?: number;
  workflowsCount?: number;
  assetName?: string;
  status: ProblemStatus;
  statusLabel?: string;
  description?: string;
  openedAtEpochSeconds?: number;
  openedAtIso?: string;
  lastModifiedAtEpochSeconds?: number;
  lastModifiedAtIso?: string;
  lastModifiedByName?: string;
  categoryFullName?: string;
  customerName?: string;
  owner: OwnerRef;
  currentLaneId: string;
  tags: string[];
  history: ProblemHistoryEntry[];
}

export interface Team {
  id: string;
  name: string;
  managerId: string;
}

export interface Employee {
  id: string;
  name: string;
  role: 'manager' | 'employee';
  teamId: string;
}

export interface Org {
  team: Team;
  employees: Employee[];
}

export interface Lane {
  id: string;
  title: string;
  assigneeType: OwnerType;
  assigneeId: string;
}

export interface Board {
  id: string;
  name: string;
  lanes: Lane[];
}

export interface AllowedMove {
  fromType: OwnerType;
  toType: OwnerType;
}

export interface Model {
  org: Org;
  boards: Board[];
  problems: Problem[];
  allowedMoves: AllowedMove[];
}
