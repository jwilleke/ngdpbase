/**
 * #1876 — the site restore record: parts staged together go in together at
 * the next start, or none of them does. Real files in a temp directory; each
 * test removes only that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyPartAtStart, beginSiteRestore, commitSiteRestore, discardSiteRestore, finishSiteRestoreAtBoot,
  recordStagedPart, stagedPathFor, type StagedSwap
} from '../siteRestore';

let dir: string;
let manifest: string;

/** A live folder with one file, and a staged copy beside it. */
function part(name: string): StagedSwap {
  const live = path.join(dir, name);
  fs.mkdirSync(live);
  fs.writeFileSync(path.join(live, 'f.txt'), `live ${name}`);
  const staged = stagedPathFor(live);
  fs.mkdirSync(staged);
  fs.writeFileSync(path.join(staged, 'f.txt'), `restored ${name}`);
  return { live, staged };
}

const read = (folder: string): string => fs.readFileSync(path.join(dir, folder, 'f.txt'), 'utf8');
const onlyItsOwn = (swap: StagedSwap) => (s: StagedSwap): boolean => s.live === swap.live;

function staged(...swaps: Array<[string, StagedSwap]>): void {
  beginSiteRestore(manifest, { stagedAt: '2026-10-19T00:00:00Z', backup: '2026-10-18T00:00:00Z', source: 'b.json.gz', stagedBy: 'admin', safetyBackup: 'safety.json.gz' });
  for (const [manager, swap] of swaps) recordStagedPart(manifest, { manager, swaps: [swap] });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-site-restore-'));
  manifest = path.join(dir, 'site-restore.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('site restore record (#1876)', () => {
  test('a committed set: each part goes in at its own start, the old data kept, and the record finishes', () => {
    const roles = part('roles');
    const persons = part('persons');
    staged(['RoleManager', roles], ['PersonManager', persons]);
    commitSiteRestore(manifest);

    expect(applyPartAtStart(manifest, 'RoleManager', { allowed: onlyItsOwn(roles) })?.applied).toHaveLength(1);
    expect(read('roles')).toBe('restored roles');
    expect(read('roles.pre-restore')).toBe('live roles');
    // Half-way through the start the record says what is done, so a stop here resumes.
    expect(JSON.parse(fs.readFileSync(manifest, 'utf8')).parts[0].status).toBe('applied');
    expect(applyPartAtStart(manifest, 'PersonManager', { allowed: onlyItsOwn(persons) })?.applied).toHaveLength(1);
    expect(fs.existsSync(manifest)).toBe(false);
    const finished = finishSiteRestoreAtBoot(manifest);
    expect(finished?.parts.map((p) => p.status)).toEqual(['applied', 'applied']);
    expect(fs.existsSync(`${manifest}.last`)).toBe(true);
  });

  test('an interrupted staging applies nothing: every part is set aside', () => {
    const roles = part('roles');
    staged(['RoleManager', roles]);
    // No commit: the server stopped while staging.
    const outcome = applyPartAtStart(manifest, 'RoleManager', { allowed: onlyItsOwn(roles) });
    expect(outcome?.refused).toMatch(/interrupted staging/);
    expect(read('roles')).toBe('live roles');
    expect(fs.existsSync(`${roles.staged}.incomplete`)).toBe(true);
    expect(finishSiteRestoreAtBoot(manifest)?.state).toBe('refused');
  });

  test('a part whose staged files are gone stops every part, even one that is whole', () => {
    const roles = part('roles');
    const persons = part('persons');
    staged(['RoleManager', roles], ['PersonManager', persons]);
    commitSiteRestore(manifest);
    fs.rmSync(persons.staged, { recursive: true });
    expect(applyPartAtStart(manifest, 'RoleManager', { allowed: onlyItsOwn(roles) })?.refused).toMatch(/PersonManager: persons\.staged/);
    expect(read('roles')).toBe('live roles');
    expect(applyPartAtStart(manifest, 'PersonManager', { allowed: onlyItsOwn(persons) })?.refused).toBeDefined();
    expect(read('persons')).toBe('live persons');
    expect(finishSiteRestoreAtBoot(manifest)?.parts.every((p) => p.status === 'set-aside')).toBe(true);
  });

  test('a manifest naming a path that is not the manager\'s own replaces nothing', () => {
    const roles = part('roles');
    const elsewhere = part('elsewhere');
    staged(['RoleManager', elsewhere]);
    commitSiteRestore(manifest);
    const outcome = applyPartAtStart(manifest, 'RoleManager', { allowed: onlyItsOwn(roles) });
    expect(outcome?.refused).toMatch(/not RoleManager's to replace/);
    expect(read('elsewhere')).toBe('live elsewhere');
    expect(read('roles')).toBe('live roles');
  });

  test('staged files with no record naming them are set aside, never applied', () => {
    const roles = part('roles');
    const outcome = applyPartAtStart(manifest, 'RoleManager', { allowed: onlyItsOwn(roles), strays: () => [roles.staged] });
    expect(outcome?.refused).toMatch(/no site restore naming them/);
    expect(read('roles')).toBe('live roles');
    expect(fs.existsSync(roles.staged)).toBe(false);
  });

  test('a record that cannot be read applies nothing and is left as it is', () => {
    const roles = part('roles');
    fs.writeFileSync(manifest, 'not json');
    const outcome = applyPartAtStart(manifest, 'RoleManager', { allowed: onlyItsOwn(roles), strays: () => [roles.staged] });
    expect(outcome?.refused).toMatch(/cannot be read/);
    expect(read('roles')).toBe('live roles');
    expect(fs.readFileSync(manifest, 'utf8')).toBe('not json');
  });

  test('discarding removes every staged file and the record; live data is untouched', () => {
    const roles = part('roles');
    const extra = path.join(dir, 'db.restore.json');
    fs.writeFileSync(extra, '{}');
    staged(['RoleManager', roles]);
    recordStagedPart(manifest, { manager: 'DatabaseManager', swaps: [], discard: [extra] });
    discardSiteRestore(manifest);
    expect(fs.existsSync(roles.staged)).toBe(false);
    expect(fs.existsSync(extra)).toBe(false);
    expect(fs.existsSync(manifest)).toBe(false);
    expect(read('roles')).toBe('live roles');
  });

  test('a second restore cannot begin over a staged one', () => {
    staged(['RoleManager', part('roles')]);
    expect(() => beginSiteRestore(manifest, { stagedAt: '', backup: '', source: '', stagedBy: '' })).toThrow(/already staged/);
  });
});
