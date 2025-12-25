import fs from 'node:fs';

const raw = fs.readFileSync('public/data.json', 'utf8');
const d = JSON.parse(raw);
const grpmem = Array.isArray(d.grpmem) ? d.grpmem : [];
const probs = Array.isArray(d.problems) ? d.problems : [];

const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

const groupNames = uniq(grpmem.map((x) => x.group_name));
const groupUuids = uniq(grpmem.map((x) => x.group_uuid));
const groupIds = uniq(grpmem.map((x) => x.group_id));

console.log('grpmem', grpmem.length, 'problems', probs.length);
console.log('unique group_name', groupNames.length, 'sample', groupNames.slice(0, 10));
console.log('unique grpmem.group_uuid', groupUuids.length, 'sample', groupUuids.slice(0, 5));
console.log('unique grpmem.group_id', groupIds.length, 'sample', groupIds.slice(0, 5));

const assigneeIds = uniq(probs.map((p) => p.assignee_id));
const memberUuids = uniq(grpmem.map((m) => m.member_uuid));
const assigneeMatches = assigneeIds.filter((id) => memberUuids.includes(id)).length;
console.log('unique assignee_id', assigneeIds.length, 'matches member_uuid', assigneeMatches);

const byGroupName = new Map();
for (const p of probs) {
  const gn = p.group_name || '';
  byGroupName.set(gn, (byGroupName.get(gn) || 0) + 1);
}
const top = [...byGroupName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('top problem group_name counts', top);

const byGroupId = new Map();
for (const p of probs) {
  const gid = p.group_id || '';
  byGroupId.set(gid, (byGroupId.get(gid) || 0) + 1);
}
const topId = [...byGroupId.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('top problem group_id counts', topId);

const byGroupUuid = new Map();
for (const p of probs) {
  const gu = p.group_uuid || '';
  byGroupUuid.set(gu, (byGroupUuid.get(gu) || 0) + 1);
}
const topUuid = [...byGroupUuid.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('top problem group_uuid counts', topUuid);
