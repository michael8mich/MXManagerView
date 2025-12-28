import fs from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = process.cwd();
const dataPath = path.join(workspaceRoot, 'public', 'data.json');

const GRPMEM_KEYS = [
  'group_uuid',
  'group_name',
  'member_uuid',
  'member_name',
  'inactive',
  'manager_flag'
];

const PROBLEM_KEYS = [
  'id',
  'ref_num',
  'summary',
  'description',
  'status',
  'status_name',
  'open_date',
  'category_name',
  'category_name_first',
  'customer_name',
  'group_id',
  'group_name',
  'assignee_id',
  'assignee_name',
  'priority',
  'type',
  'last_mod_dt',
  'last_mod_by_name',
  'attmnts',
  'wfs',
  'asset_name'
];

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

function parseArgs(argv) {
  const flags = new Set(argv);
  return {
    inPlace: flags.has('--in-place'),
    backup: flags.has('--backup') || flags.has('--in-place')
  };
}

const { inPlace, backup } = parseArgs(process.argv.slice(2));

const raw = await fs.readFile(dataPath, 'utf8');
const json = JSON.parse(raw);

const cleaned = {
  grpmem: Array.isArray(json.grpmem) ? json.grpmem.map((g) => pick(g ?? {}, GRPMEM_KEYS)) : [],
  problems: Array.isArray(json.problems) ? json.problems.map((p) => pick(p ?? {}, PROBLEM_KEYS)) : []
};

if (!inPlace) {
  const outPath = path.join(workspaceRoot, 'public', 'data.cleaned.json');
  await fs.writeFile(outPath, JSON.stringify(cleaned, null, 4) + '\n', 'utf8');
  console.log(`Wrote ${outPath}`);
  process.exit(0);
}

if (backup) {
  const backupPath = path.join(workspaceRoot, 'public', 'data.full.json');
  try {
    // Avoid overwriting an existing backup.
    await fs.access(backupPath);
    console.log(`Backup already exists: ${backupPath}`);
  } catch {
    await fs.writeFile(backupPath, raw, 'utf8');
    console.log(`Backup saved: ${backupPath}`);
  }
}

await fs.writeFile(dataPath, JSON.stringify(cleaned, null, 4) + '\n', 'utf8');
console.log(`Rewrote ${dataPath}`);
