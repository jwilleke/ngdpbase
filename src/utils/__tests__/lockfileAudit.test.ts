/**
 * #1242 — the dependency audit covers every lockfile, and reads npm's exit
 * code the way npm means it.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { atOrAbove, findLockfiles, interpret, loadAllowlist, run, type AllowlistEntry, type AuditRunner } from '../../../scripts/check-lockfile-audit';

const counts = (o: Partial<Record<string, number>>) => JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...o } } });

describe('#1242 — lockfile discovery', () => {
  let repo: string;
  beforeEach(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-lockfiles-'));
    for (const rel of ['package-lock.json', 'addons/one/package-lock.json', 'addons/two/package-lock.json', 'addons/one/node_modules/dep/package-lock.json', 'dist/package-lock.json']) {
      await fs.outputFile(path.join(repo, rel), '{}');
    }
  });
  afterEach(async () => { await fs.remove(repo); });

  test('finds the root and every addon lockfile; never one inside node_modules or dist', () => {
    expect(findLockfiles(repo)).toEqual(['package-lock.json', path.join('addons', 'one', 'package-lock.json'), path.join('addons', 'two', 'package-lock.json')]);
  });

  test('the real tree: the root and the five bundled addons', () => {
    const found = findLockfiles();
    expect(found).toContain('package-lock.json');
    for (const a of ['calendar', 'elasticsearch', 'feeds', 'forms', 'journal']) expect(found).toContain(path.join('addons', a, 'package-lock.json'));
    expect(found.some((f) => f.includes('node_modules'))).toBe(false);
  });

  test('run() audits each lockfile in its own directory and reports per file', () => {
    const seen: string[] = [];
    const runner: AuditRunner = (dir) => { seen.push(path.relative(repo, dir) || '.'); return { status: dir.endsWith('two') ? 1 : 0, stdout: counts(dir.endsWith('two') ? { high: 2, total: 2 } : {}), stderr: '' }; };
    const results = run(repo, runner);
    expect(seen).toEqual(['.', path.join('addons', 'one'), path.join('addons', 'two')]);
    expect(results.map((r) => r.status)).toEqual(['clean', 'clean', 'findings']);
  });
});

describe('#1242 — npm\'s exit code, npm\'s way', () => {
  test('exit 0 with zero counts is clean; exit 1 with a moderate finding is findings', () => {
    expect(interpret('x', { status: 0, stdout: counts({}), stderr: '' }).status).toBe('clean');
    expect(interpret('x', { status: 1, stdout: counts({ moderate: 1, total: 1 }), stderr: '' }).status).toBe('findings');
  });

  test('a low-only finding is below the level and does not fail', () => {
    expect(interpret('x', { status: 1, stdout: counts({ low: 3, total: 3 }), stderr: '' }).status).toBe('clean');
    expect(atOrAbove({ info: 1, low: 3, moderate: 0, high: 0, critical: 0, total: 4 }, 'moderate')).toBe(0);
  });

  test('an unreachable registry is said, not scored', () => {
    const r = interpret('x', { status: 1, stdout: JSON.stringify({ error: { code: 'ENOTFOUND', summary: 'request to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk failed' } }), stderr: '' });
    expect(r.status).toBe('unreachable');
    expect(r.counts).toBeNull();
  });

  test('any other exit code is a tool failure, not a pass', () => {
    expect(interpret('x', { status: 2, stdout: '', stderr: 'npm ERR! something' }).status).toBe('error');
    expect(interpret('x', { status: 0, stdout: 'not json', stderr: '' }).status).toBe('error');
  });
});

describe('#1242 — the allowlist subtracts only what the operator decided, and only until the review date', () => {
  const advisory = (id: string) => ({ source: 1, name: 'pkg', severity: 'moderate', url: `https://github.com/advisories/${id}` });
  const report = (via: unknown[], viaChild: unknown[] = ['pkg']) => JSON.stringify({
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 2, high: 0, critical: 0, total: 2 } },
    vulnerabilities: { pkg: { severity: 'moderate', via }, child: { severity: 'moderate', via: viaChild } }
  });
  const entry = (id: string, reviewBy = '2099-01-01'): AllowlistEntry => ({ advisory: id, issue: '#1', reason: 'decided', reviewBy });
  const allow = (...ids: string[]) => new Map(ids.map((id) => [id, entry(id)]));

  test('a package whose every advisory is listed is subtracted — and the package reached only through it with it', () => {
    const r = interpret('x', { status: 1, stdout: report([advisory('GHSA-aaaa-bbbb-cccc')]), stderr: '' }, allow('GHSA-aaaa-bbbb-cccc'));
    expect(r.status).toBe('clean');
    expect(r.allowlisted?.sort()).toEqual(['child', 'pkg']);
    expect(r.counts?.moderate).toBe(0);
  });

  test('one listed and one new advisory on the same package still fails', () => {
    const r = interpret('x', { status: 1, stdout: report([advisory('GHSA-aaaa-bbbb-cccc'), advisory('GHSA-dddd-eeee-ffff')]), stderr: '' }, allow('GHSA-aaaa-bbbb-cccc'));
    expect(r.status).toBe('findings');
    expect(r.allowlisted).toBeUndefined();
  });

  test('an expired entry stops counting', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-allow-'));
    try {
      await fs.outputJson(path.join(repo, 'scripts', 'audit-allowlist.json'), { entries: [entry('GHSA-aaaa-bbbb-cccc', '2020-01-01'), entry('GHSA-dddd-eeee-ffff', '2099-01-01')] });
      const live = loadAllowlist(repo, new Date('2026-09-06'));
      expect([...live.keys()]).toEqual(['GHSA-dddd-eeee-ffff']);
    } finally {
      await fs.remove(repo);
    }
  });

  test('the real allowlist: every entry names an issue, a reason and a review date, and is not yet expired', () => {
    const live = loadAllowlist();
    const raw = fs.readJsonSync(path.join(__dirname, '..', '..', '..', 'scripts', 'audit-allowlist.json')) as { entries: AllowlistEntry[] };
    expect(raw.entries.length).toBeGreaterThan(0);
    for (const e of raw.entries) {
      expect(e.issue).toMatch(/^#\d+$/);
      expect(e.reason.length).toBeGreaterThan(10);
      expect(live.has(e.advisory)).toBe(true);
    }
  });
});

