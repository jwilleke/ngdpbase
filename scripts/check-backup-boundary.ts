#!/usr/bin/env tsx
/**
 * Folder backup is BackupManager's (#1984, #1985).
 *
 * A manager declares where its data lives (`BaseManager.backupFolders()`),
 * an add-on's `dataPath` counts for it, and BackupManager archives, stages
 * and applies every declared part through `src/utils/directoryBackup.ts`.
 * Before #1985 nine core managers and three bundled add-ons called those
 * helpers themselves, each with near-identical code, and the add-ons reached
 * them through core's `dist/` — which an external add-on cannot.
 *
 * So nothing but BackupManager imports `directoryBackup`. Tests may: a test
 * drives the module, or a manager's declared parts, without a whole backup.
 * A manager whose files are not one declared folder (the attachments, the
 * audit log) gets an archive's name and key from BackupManager through its
 * backup and restore options instead.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = ['src', 'addons'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

/** The files that may import it: its owner, itself, and tests. */
const ALLOWED = new Set(['src/managers/BackupManager.ts', 'src/utils/directoryBackup.ts']);
const TEST = /(?:^|\/)__tests__\/|\.test\.ts$/;

/** An import or a dynamic import of the module, by any relative or `dist/` path. */
const IMPORT = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"][^'"]*\/directoryBackup(?:\.js|\.ts)?['"]/;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|mts|cts)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
}

const files: string[] = [];
for (const root of SCAN) walk(path.join(REPO, root), files);

const violations: string[] = [];
for (const file of files) {
  const rel = path.relative(REPO, file).split(path.sep).join('/');
  if (ALLOWED.has(rel) || TEST.test(rel)) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (IMPORT.test(line)) violations.push(`${rel}:${i + 1}: ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error('Only BackupManager imports src/utils/directoryBackup.ts (#1985). Declare the folder with backupFolders() (an add-on\'s dataPath is backed up for it), or take an archive\'s name and key from the backup options:');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`check-backup-boundary: ${files.length} files, nothing imports directoryBackup but BackupManager`);
