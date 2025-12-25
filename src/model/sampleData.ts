import type { Model } from './types';

export const sampleData: Model = {
  org: {
    team: { id: 'team-1', name: 'Team Alpha', managerId: 'emp-100' },
    employees: [
      { id: 'emp-100', name: 'Maya (Manager)', role: 'manager', teamId: 'team-1' },
      { id: 'emp-101', name: 'Noah', role: 'employee', teamId: 'team-1' },
      { id: 'emp-102', name: 'Ava', role: 'employee', teamId: 'team-1' },
      { id: 'emp-103', name: 'Liam', role: 'employee', teamId: 'team-1' }
    ]
  },
  boards: [
    {
      id: 'board-1',
      name: 'Open Problems',
      lanes: [
        { id: 'lane-team', title: 'Team Queue', assigneeType: 'team', assigneeId: 'team-1' },
        { id: 'lane-emp-101', title: 'Noah', assigneeType: 'employee', assigneeId: 'emp-101' },
        { id: 'lane-emp-102', title: 'Ava', assigneeType: 'employee', assigneeId: 'emp-102' },
        { id: 'lane-emp-103', title: 'Liam', assigneeType: 'employee', assigneeId: 'emp-103' }
      ]
    }
  ],
  problems: [
    {
      id: 'pr-2001',
      title: 'Database timeout in report export',
      priority: 'P1',
      status: 'open',
      owner: { type: 'team', id: 'team-1' },
      currentLaneId: 'lane-team',
      tags: ['db', 'timeout'],
      history: [
        {
          at: '2025-12-20T10:12:00Z',
          action: 'created',
          by: 'emp-100',
          from: null,
          to: { type: 'team', id: 'team-1' }
        }
      ]
    },
    {
      id: 'pr-2002',
      title: 'Incorrect totals on dashboard',
      priority: 'P2',
      status: 'open',
      owner: { type: 'team', id: 'team-1' },
      currentLaneId: 'lane-team',
      tags: ['ui', 'calc'],
      history: [
        {
          at: '2025-12-21T09:00:00Z',
          action: 'created',
          by: 'emp-100',
          from: null,
          to: { type: 'team', id: 'team-1' }
        }
      ]
    },
    {
      id: 'pr-2003',
      title: 'Fix failing nightly job',
      priority: 'P1',
      status: 'in_progress',
      owner: { type: 'employee', id: 'emp-101' },
      currentLaneId: 'lane-emp-101',
      tags: ['jobs', 'infra'],
      history: [
        {
          at: '2025-12-22T08:30:00Z',
          action: 'assigned',
          by: 'emp-100',
          from: { type: 'team', id: 'team-1' },
          to: { type: 'employee', id: 'emp-101' }
        }
      ]
    },
    {
      id: 'pr-2004',
      title: 'Customer crash on login (iOS)',
      priority: 'P0',
      status: 'open',
      owner: { type: 'employee', id: 'emp-102' },
      currentLaneId: 'lane-emp-102',
      tags: ['ios', 'crash'],
      history: [
        {
          at: '2025-12-23T13:10:00Z',
          action: 'assigned',
          by: 'emp-100',
          from: { type: 'team', id: 'team-1' },
          to: { type: 'employee', id: 'emp-102' }
        }
      ]
    }
  ],
  allowedMoves: [
    { fromType: 'employee', toType: 'employee' },
    { fromType: 'employee', toType: 'team' },
    { fromType: 'team', toType: 'employee' }
  ]
};
