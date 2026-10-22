/**
 * #1986 — the site restore record is BackupManager's. A manager records its
 * staged part through the `siteRestore` restore option (bound to its own
 * name), and applies it at start through `applyStagedPartAtStart` or
 * `siteRestorePartAtStart`; the staged `.env` is applied at the very start
 * of the process from the same record. The record's format is v5.25.0's.
 *
 * Real files in a temp directory; each test removes only that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyStagedPartAtStart, siteRestorePartAtStart } from '../BackupManager';
import { beginSiteRestore, commitSiteRestore, readSiteRestore, stagingFor } from '../../utils/siteRestore';
import { applyInstanceEnvAtStart, INSTANCE_ENV_PART } from '../../utils/instanceEnvBackup';

let dir: string;
let manifest: string;
const engine = () => ({
  getManager: (name: string) => (name === 'ConfigurationManager'
    ? { getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.backup.restore-manifest' ? manifest : d) }
    : undefined)
}) as never;

/** A live folder with one file, and its staged copy beside it, named as BackupManager names it. */
function folder(name: string): { live: string; staged: string } {
  const live = path.join(dir, name);
  fs.mkdirSync(live);
  fs.writeFileSync(path.join(live, 'f.txt'), `live ${name}`);
  const staged = stagingFor(manifest, 'unused').stagedPathFor(live);
  fs.mkdirSync(staged);
  fs.writeFileSync(path.join(staged, 'f.txt'), `restored ${name}`);
  return { live, staged };
}
const read = (p: string): string => fs.readFileSync(path.join(p, 'f.txt'), 'utf8');
const begin = (): void => beginSiteRestore(manifest, { stagedAt: '2026-10-22T00:00:00Z', backup: '2026-10-21T00:00:00Z', source: 'b.json.gz.enc', stagedBy: 'admin' });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1986-api-'));
  manifest = path.join(dir, 'site-restore.json');
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('recording a staged part: the restore option (#1986)', () => {
  test('records under its own manager\'s name, with the staged path beside the live one, in the v5.25.0 record format', () => {
    const roles = folder('roles');
    begin();
    const staging = stagingFor(manifest, 'RoleManager');
    expect(staging.stagedPathFor(roles.live)).toBe(`${roles.live}.staged`);
    staging.record([roles]);
    stagingFor(manifest, 'DatabaseManager').record([{ live: path.join(dir, 'a.db'), staged: path.join(dir, 'a.db.staged') }], { discard: [path.join(dir, 'a.db.restore.json')] });
    // Exactly the shape v5.25.0 writes and reads.
    expect(JSON.parse(fs.readFileSync(manifest, 'utf8'))).toEqual({
      version: 1, state: 'staging', stagedAt: '2026-10-22T00:00:00Z', backup: '2026-10-21T00:00:00Z', source: 'b.json.gz.enc', stagedBy: 'admin',
      parts: [
        { manager: 'RoleManager', swaps: [roles] },
        { manager: 'DatabaseManager', swaps: [{ live: path.join(dir, 'a.db'), staged: path.join(dir, 'a.db.staged') }], discard: [path.join(dir, 'a.db.restore.json')] }
      ]
    });
  });

  test('only while a restore is being staged', () => {
    expect(() => stagingFor(manifest, 'RoleManager').record([])).toThrow(/No site restore is being staged/);
  });
});

describe('applyStagedPartAtStart (#1986)', () => {
  test('a committed part goes in at its manager\'s start, the old data kept, and the record finishes', () => {
    const pool = folder('pool');
    begin();
    stagingFor(manifest, 'AttachmentManager').record([pool]);
    commitSiteRestore(manifest);
    const outcome = applyStagedPartAtStart(engine(), 'AttachmentManager', { allowed: (s) => s.live === pool.live });
    expect(outcome).toEqual({ applied: [{ live: pool.live, kept: `${pool.live}.pre-restore` }] });
    expect(read(pool.live)).toBe('restored pool');
    expect(read(`${pool.live}.pre-restore`)).toBe('live pool');
    expect(readSiteRestore(manifest)).toBeNull();
    expect(JSON.parse(fs.readFileSync(`${manifest}.done`, 'utf8')).parts[0].status).toBe('applied');
  });

  test('nothing to do: null', () => {
    expect(applyStagedPartAtStart(engine(), 'AttachmentManager', { allowed: () => true, mayBeStaged: () => [path.join(dir, 'none')] })).toBeNull();
  });

  test('a manifest naming a path that is not the manager\'s own replaces nothing', () => {
    const pool = folder('pool');
    begin();
    stagingFor(manifest, 'AttachmentManager').record([pool]);
    commitSiteRestore(manifest);
    const outcome = applyStagedPartAtStart(engine(), 'AttachmentManager', { allowed: () => false });
    expect(outcome?.refused).toMatch(/not AttachmentManager's to replace/);
    expect(read(pool.live)).toBe('live pool');
    expect(fs.existsSync(`${pool.staged}.incomplete`)).toBe(true);
  });

  test('a staged copy no restore names is set aside, found from the live paths the manager names', () => {
    const pool = folder('pool');
    const outcome = applyStagedPartAtStart(engine(), 'AttachmentManager', { allowed: () => true, mayBeStaged: () => [pool.live] });
    expect(outcome?.refused).toMatch(/no site restore naming them/);
    expect(read(pool.live)).toBe('live pool');
    expect(fs.existsSync(`${pool.staged}.incomplete`)).toBe(true);
  });

  test('`put` puts the swap in place itself; a `put` that throws sets the part aside and refuses the restore', () => {
    const audit = folder('audit');
    begin();
    stagingFor(manifest, 'AuditManager').record([audit]);
    commitSiteRestore(manifest);
    const puts: string[] = [];
    const outcome = applyStagedPartAtStart(engine(), 'AuditManager', {
      allowed: () => true,
      put: (swap, kept) => {
        puts.push(kept);
        fs.renameSync(swap.live, kept);
        fs.renameSync(swap.staged, swap.live);
      }
    });
    expect(puts).toEqual([`${audit.live}.pre-restore`]);
    expect(outcome?.applied).toHaveLength(1);
    expect(read(audit.live)).toBe('restored audit');

    fs.rmSync(`${manifest}.done`);
    const again = folder('again');
    begin();
    stagingFor(manifest, 'AuditManager').record([again]);
    commitSiteRestore(manifest);
    const refused = applyStagedPartAtStart(engine(), 'AuditManager', { allowed: () => true, put: () => { throw new Error('not audit files'); } });
    expect(refused?.refused).toMatch(/not audit files/);
    expect(read(again.live)).toBe('live again');
    expect(JSON.parse(fs.readFileSync(`${manifest}.done`, 'utf8'))).toMatchObject({ state: 'refused', parts: [{ status: 'set-aside' }] });
  });
});

describe('siteRestorePartAtStart (#1986)', () => {
  test('none when no site restore names the manager; settling it records nothing', () => {
    const gate = siteRestorePartAtStart(engine(), 'DatabaseManager');
    expect(gate.decision).toBe('none');
    gate.settle('applied');
    expect(fs.existsSync(manifest)).toBe(false);
  });

  test('apply when the whole restore is there, and the manager settles its part', () => {
    const db = folder('db');
    const roles = folder('roles');
    begin();
    stagingFor(manifest, 'DatabaseManager').record([db]);
    stagingFor(manifest, 'RoleManager').record([roles]);
    commitSiteRestore(manifest);
    const gate = siteRestorePartAtStart(engine(), 'DatabaseManager');
    expect(gate.decision).toBe('apply');
    gate.settle('applied');
    expect(readSiteRestore(manifest)?.parts.find((p) => p.manager === 'DatabaseManager')?.status).toBe('applied');
  });

  test('set-aside, with the reason, for an interrupted staging; the manager settles its part as set aside', () => {
    const db = folder('db');
    begin();
    stagingFor(manifest, 'DatabaseManager').record([db]);
    const gate = siteRestorePartAtStart(engine(), 'DatabaseManager');
    expect(gate.decision).toBe('set-aside');
    expect(gate.reason).toMatch(/interrupted staging/);
    gate.settle('set-aside', gate.reason);
    expect(JSON.parse(fs.readFileSync(`${manifest}.done`, 'utf8'))).toMatchObject({ state: 'refused', parts: [{ manager: 'DatabaseManager', status: 'set-aside' }] });
  });
});

describe('the staged .env at the very start of the process (#1986)', () => {
  test('a .env part recorded through BackupManager\'s staging is applied before the environment loads, the live key lines kept', () => {
    const live = path.join(dir, '.env');
    fs.writeFileSync(live, 'SMTP_PASSWORD=live\nNGDPBASE_BACKUP_KEY=live-key\n');
    begin();
    const staging = stagingFor(manifest, INSTANCE_ENV_PART);
    fs.writeFileSync(staging.stagedPathFor(live), 'SMTP_PASSWORD=backed-up\n');
    staging.record([{ live, staged: staging.stagedPathFor(live) }]);
    commitSiteRestore(manifest);
    const outcome = applyInstanceEnvAtStart(dir, manifest);
    expect(outcome?.applied?.after).toContain('SMTP_PASSWORD=backed-up');
    expect(fs.readFileSync(live, 'utf8')).toContain('NGDPBASE_BACKUP_KEY=live-key');
    expect(fs.readFileSync(`${live}.pre-restore`, 'utf8')).toContain('SMTP_PASSWORD=live');
    expect(JSON.parse(fs.readFileSync(`${manifest}.done`, 'utf8')).parts).toEqual([expect.objectContaining({ manager: 'BackupManager', status: 'applied' })]);
  });
});
