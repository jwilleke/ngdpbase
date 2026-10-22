#!/usr/bin/env tsx
/**
 * Backup is BackupManager's (#1984).
 *
 * - __Folder backup__ (#1985). A manager declares where its data lives
 *   (`BaseManager.backupFolders()`), an add-on's `dataPath` counts for it,
 *   and BackupManager archives, stages and applies every declared part
 *   through `src/utils/directoryBackup.ts`. Before #1985 nine core managers
 *   and three bundled add-ons called those helpers themselves, each with
 *   near-identical code, and the add-ons reached them through core's
 *   `dist/` — which an external add-on cannot. A manager whose files are not
 *   one declared folder (the attachments, the audit log) gets an archive's
 *   name and key from BackupManager through its backup and restore options.
 * - __The site restore record__ (#1986), `src/utils/siteRestore.ts`. Before
 *   #1986 four managers and four providers wrote it directly. A manager
 *   whose restore is staged records its part through the `siteRestore`
 *   restore option, and applies it at start through BackupManager's
 *   `applyStagedPartAtStart` / `siteRestorePartAtStart`. The staged `.env`
 *   is applied at the very start of the process, before BackupManager can
 *   be loaded, by `instanceEnvBackup.ts`, a backup internal.
 * - __Backup encryption__ (#1986), `src/utils/backupCrypto.ts`: BackupManager
 *   and the files it writes and reads backups through.
 *
 * Tests may import any of them: a test drives a module without a whole backup.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = ['src', 'addons'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const TEST = /(?:^|\/)__tests__\/|\.test\.ts$/;

interface Boundary {
  module: string;
  /** The files that may import it: its owner, itself, and the backup internals named. */
  allowed: string[];
  hint: string;
}

const BOUNDARIES: Boundary[] = [
  {
    module: 'directoryBackup',
    allowed: ['src/managers/BackupManager.ts', 'src/utils/directoryBackup.ts'],
    hint: 'Declare the folder with backupFolders() (an add-on\'s dataPath is backed up for it), or take an archive\'s name and key from the backup options (#1985).'
  },
  {
    module: 'siteRestore',
    allowed: ['src/managers/BackupManager.ts', 'src/utils/siteRestore.ts', 'src/utils/directoryBackup.ts', 'src/utils/instanceEnvBackup.ts'],
    hint: 'Record a staged part through the restore options\' siteRestore, and apply it at start through BackupManager\'s applyStagedPartAtStart or siteRestorePartAtStart (#1986).'
  },
  {
    module: 'backupCrypto',
    allowed: ['src/managers/BackupManager.ts', 'src/utils/backupCrypto.ts', 'src/utils/directoryBackup.ts', 'src/utils/treeArchive.ts', 'src/utils/backupDocument.ts'],
    hint: 'Write or read a backup part through BackupManager\'s archive options, or treeArchive (#1986).'
  }
];

/** An import or a dynamic import of the module, by any relative or `dist/` path. */
const importOf = (module: string): RegExp =>
  new RegExp(`(?:\\bfrom\\s+|\\bimport\\s*\\(\\s*|\\brequire\\s*\\(\\s*)['"][^'"]*\\/${module}(?:\\.js|\\.ts)?['"]`);

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

let failed = false;
for (const { module, allowed, hint } of BOUNDARIES) {
  const pattern = importOf(module);
  const violations: string[] = [];
  for (const file of files) {
    const rel = path.relative(REPO, file).split(path.sep).join('/');
    if (allowed.includes(rel) || TEST.test(rel)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (pattern.test(line)) violations.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  if (violations.length > 0) {
    failed = true;
    console.error(`Only BackupManager and its backup internals (${allowed.join(', ')}) import src/utils/${module}.ts. ${hint}`);
    for (const v of violations) console.error(`  ${v}`);
  }
}

if (failed) process.exit(1);
console.log(`check-backup-boundary: ${files.length} files; directoryBackup, siteRestore and backupCrypto are imported only by BackupManager and its backup internals`);
