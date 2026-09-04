/**
 * #1122 — the audit log never rotated and its retention could never fire.
 *
 * `archiveFileName`, `maxFileSize` and `maxFiles` were read into config at
 * `FileAuditProvider.ts:106-128` and never referenced again, so the log was a
 * single file appended to for the life of the instance. `cleanup()` ran once
 * from `initialize()` and compared the WHOLE FILE's mtime to the retention
 * window — on an active instance the file was just written to, so the branch
 * was unreachable.
 *
 * Rotation has to preserve the #1119 hash chain across files, or every
 * rotation would read as a chain break.
 */
vi.unmock('../FileAuditProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import FileAuditProvider from '../FileAuditProvider';
import { verifyChain } from '../../utils/auditChain';

let dir: string;

function makeProvider(overrides: Record<string, unknown> = {}) {
  const config: Record<string, unknown> = {
    'ngdpbase.audit.provider.file.logdirectory': dir,
    'ngdpbase.audit.provider.file.auditfilename': 'audit.log',
    'ngdpbase.audit.provider.file.archivefilename': 'audit-archive.log',
    'ngdpbase.audit.provider.file.maxfilesize': '400',
    'ngdpbase.audit.provider.file.maxfiles': 2,
    'ngdpbase.audit.flushinterval': 100000,
    ...overrides
  };
  const engine = {
    getManager: (name: string) => (name === 'ConfigurationManager'
      ? {
        getProperty: (k: string, d: unknown) => (k in config ? config[k] : d),
        // The provider resolves its log directory through this, not getProperty.
        getResolvedDataPath: () => dir
      }
      : null)
  } as never;
  return new FileAuditProvider(engine);
}

const archives = async () =>
  (await fs.readdir(dir)).filter((f) => f.startsWith('audit-archive.log')).sort();

/**
 * Read a log file's records, tolerating its absence: straight after a rotation
 * the live log does not exist until the next write, which is correct provider
 * behaviour and made this suite flaky when assumed away.
 */
const readRecords = async (file: string): Promise<Record<string, unknown>[]> => {
  const full = path.join(dir, file);
  if (!(await fs.pathExists(full))) return [];
  return (await fs.readFile(full, 'utf8'))
    .split('\n').filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-audit-rot-'));
});

afterEach(async () => {
  // Scoped to this test's own temp dir — never a live data tree.
  await fs.remove(dir);
});

describe('#1122 the audit log rotates', () => {
  test('a log past maxFileSize is rotated to an archive', async () => {
    const p = makeProvider();
    await p.initialize();
    for (let i = 0; i < 12; i++) {
      await p.logAuditEvent({ eventType: 'page-edit', user: `u${i}` });
      await p.flush();
    }
    expect((await archives()).length).toBeGreaterThan(0);
  });

  test('no more than maxFiles archives are kept', async () => {
    const p = makeProvider();
    await p.initialize();
    for (let i = 0; i < 40; i++) {
      await p.logAuditEvent({ eventType: 'page-edit', user: `u${i}` });
      await p.flush();
    }
    expect((await archives()).length).toBeLessThanOrEqual(2);
  });

  test('the hash chain survives rotation', async () => {
    // The whole point: a rotation must not read as a chain break. Records from
    // the archives plus the live log, in order, must verify as one chain.
    const p = makeProvider({ 'ngdpbase.audit.provider.file.maxfiles': 10 });
    await p.initialize();
    for (let i = 0; i < 20; i++) {
      await p.logAuditEvent({ eventType: 'page-edit', user: `u${i}` });
      await p.flush();
    }

    const all: Record<string, unknown>[] = [];
    for (const a of await archives()) all.push(...await readRecords(a));
    all.push(...await readRecords('audit.log'));

    expect(all.length).toBe(20);
    expect(verifyChain(all)).toEqual({ ok: true, checked: 20 });
  });

  test('the sequence continues across a restart that follows a rotation', async () => {
    // loadChainHead reads the live log; straight after a rotation that file is
    // empty, so it has to fall back to the newest archive or the chain restarts.
    const first = makeProvider({ 'ngdpbase.audit.provider.file.maxfiles': 10 });
    await first.initialize();
    for (let i = 0; i < 12; i++) {
      await first.logAuditEvent({ eventType: 'page-edit', user: `u${i}` });
      await first.flush();
    }
    // Max across every file rather than guessing which one the last record
    // landed in — that depends on exactly where rotation fell, which is not
    // what this test is about, and made it flaky in the full suite.
    const seqOf = async (): Promise<number> => {
      const all: Record<string, unknown>[] = [];
      for (const a of await archives()) all.push(...await readRecords(a));
      if (await fs.pathExists(path.join(dir, 'audit.log'))) all.push(...await readRecords('audit.log'));
      return Math.max(...all.map((r) => r.seq as number));
    };
    const lastSeq = await seqOf();

    const second = makeProvider({ 'ngdpbase.audit.provider.file.maxfiles': 10 });
    await second.initialize();
    await second.logAuditEvent({ eventType: 'page-edit', user: 'after-restart' });
    await second.flush();

    expect(await seqOf()).toBe(lastSeq + 1);
  });

  test('rotation is not attempted when the log is small', async () => {
    const p = makeProvider({ 'ngdpbase.audit.provider.file.maxfilesize': '10MB' });
    await p.initialize();
    await p.logAuditEvent({ eventType: 'page-edit', user: 'a' });
    await p.flush();
    expect(await archives()).toEqual([]);
  });
});

describe('#1122 retention applies to archives', () => {
  test('an archive past the window is removed', async () => {
    const p = makeProvider({ 'ngdpbase.audit.retentiondays': 1 });
    await p.initialize();
    for (let i = 0; i < 12; i++) {
      await p.logAuditEvent({ eventType: 'page-edit', user: `u${i}` });
      await p.flush();
    }
    const before = await archives();
    expect(before.length).toBeGreaterThan(0);

    // Age it past the window. Retention reads mtime because an archive is only
    // appended to before rotation, so its mtime IS its newest record.
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    for (const a of before) await fs.utimes(path.join(dir, a), old, old);

    await p.cleanup();
    expect(await archives()).toEqual([]);
  });

  test('a recent archive is kept', async () => {
    const p = makeProvider({ 'ngdpbase.audit.retentiondays': 90 });
    await p.initialize();
    for (let i = 0; i < 12; i++) {
      await p.logAuditEvent({ eventType: 'page-edit', user: `u${i}` });
      await p.flush();
    }
    const before = await archives();
    await p.cleanup();
    expect(await archives()).toEqual(before);
  });

  test('the live log is never removed by retention', async () => {
    // The old implementation moved the LIVE log when its mtime aged out,
    // discarding the previous archive in the process.
    const p = makeProvider({ 'ngdpbase.audit.retentiondays': 0 });
    await p.initialize();
    await p.logAuditEvent({ eventType: 'page-edit', user: 'a' });
    await p.flush();
    await p.cleanup();
    expect(await fs.pathExists(path.join(dir, 'audit.log'))).toBe(true);
  });
});
