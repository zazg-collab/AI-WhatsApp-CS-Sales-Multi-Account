import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function fileUrl(path) {
  return new URL(`../${path}`, import.meta.url);
}

function exists(path) {
  return existsSync(fileUrl(path));
}

function read(path) {
  return readFileSync(fileUrl(path), 'utf8');
}

const conflictFiles = [
  'apps/web/src/app/monitoring/page.test.tsx',
  'apps/web/src/app/monitoring/page.tsx',
  'apps/web/src/app/page.test.tsx',
  'apps/web/src/app/page.tsx',
  'apps/web/src/app/settings/ai/page.test.tsx',
  'apps/web/src/app/settings/ai/page.tsx',
  'apps/web/src/app/templates/page.test.tsx',
  'apps/web/src/app/templates/page.tsx',
  'apps/web/src/components/AppLayout.test.tsx',
  'apps/web/src/components/AppLayout.tsx',
  'apps/web/src/components/Sidebar.test.tsx',
  'apps/web/src/components/Sidebar.tsx',
  'apps/web/src/components/ThemeToggle.tsx',
  'apps/web/tailwind.config.ts',
  'package-lock.json',
  'packages/database/prisma/schema.prisma',
  'scripts/qa-check.mjs',
];

for (const file of conflictFiles) {
  if (!exists(file)) continue;
  assert.doesNotMatch(read(file), /<<<<<<<|=======|>>>>>>>/, `${file} must not contain merge conflict markers`);
}

const mergeNotes = read('docs/merge-conflict-resolution.md');
assert.match(mergeNotes, /`main` the source of truth/, 'Merge notes must document main-source conflict strategy');
assert.match(mergeNotes, /dependency lockfile and Prisma schema/, 'Merge notes must document package-lock and schema conflict handling');

console.log('Conflict-resolution checks passed');
