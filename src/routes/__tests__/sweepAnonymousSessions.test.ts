/**
 * sweepAnonymousSessions unit tests (#777)
 *
 * Exercises the pure file-walking helper against a real temp directory so
 * the actual unlink / readJson / filter logic runs without mocking fs.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fse from 'fs-extra';
import os from 'os';
import path from 'path';

import { sweepAnonymousSessions } from '../WikiRoutes';

async function writeSession(dir: string, id: string, data: unknown): Promise<void> {
  await fse.writeJson(path.join(dir, id + '.json'), data);
}

async function writeOrphan(dir: string, id: string, suffix: string): Promise<void> {
  await fse.writeFile(path.join(dir, id + '.json.' + suffix), 'partial');
}

describe('sweepAnonymousSessions (#777)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), 'ngdpbase-sweep-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    await fse.ensureDir(tmpDir);
  });

  afterEach(async () => {
    if (tmpDir && tmpDir.includes('ngdpbase-sweep-test-')) {
      await fse.remove(tmpDir);
    }
  });

  test('returns zeroes on a missing directory', async () => {
    const result = await sweepAnonymousSessions(path.join(tmpDir, 'does-not-exist'), null);
    expect(result).toEqual({ removed: 0, kept: 0, orphansRemoved: 0 });
  });

  test('removes anonymous (no user fields) sessions and keeps authed', async () => {
    await writeSession(tmpDir, 'auth-1', { cookie: {}, username: 'jim', isAuthenticated: true });
    await writeSession(tmpDir, 'auth-2-nested', { cookie: {}, user: { isAuthenticated: true, username: 'admin' } });
    await writeSession(tmpDir, 'anon-1-csrf-only', { cookie: {}, csrfToken: 'abc' });
    await writeSession(tmpDir, 'anon-2-explicit-false', { cookie: {}, isAuthenticated: false });
    await writeSession(tmpDir, 'anon-3-nested-false', { cookie: {}, user: { isAuthenticated: false } });

    const result = await sweepAnonymousSessions(tmpDir, null);
    expect(result.removed).toBe(3);
    expect(result.kept).toBe(2);
    expect(result.orphansRemoved).toBe(0);

    // Verify the right files survived
    const remaining = (await fse.readdir(tmpDir)).filter(f => f.endsWith('.json')).sort();
    expect(remaining).toEqual(['auth-1.json', 'auth-2-nested.json']);
  });

  test('always removes *.json.NNN atomic-write orphans regardless of contents', async () => {
    await writeSession(tmpDir, 'auth-1', { cookie: {}, isAuthenticated: true });
    await writeOrphan(tmpDir, 'auth-1', '12345');
    await writeOrphan(tmpDir, 'anon-stale', '99999');
    await writeSession(tmpDir, 'anon-1', { cookie: {} });

    const result = await sweepAnonymousSessions(tmpDir, null);
    expect(result.removed).toBe(1);    // anon-1.json
    expect(result.kept).toBe(1);       // auth-1.json
    expect(result.orphansRemoved).toBe(2);

    const remaining = await fse.readdir(tmpDir);
    expect(remaining.sort()).toEqual(['auth-1.json']);
  });

  test('never deletes the caller session even when it is anonymous', async () => {
    await writeSession(tmpDir, 'self', { cookie: {} });               // anon, but ID is self
    await writeSession(tmpDir, 'someone-else', { cookie: {} });       // anon, deletable

    const result = await sweepAnonymousSessions(tmpDir, 'self');
    expect(result.removed).toBe(1);
    expect(result.kept).toBe(1);
    expect(result.orphansRemoved).toBe(0);

    const remaining = (await fse.readdir(tmpDir)).sort();
    expect(remaining).toEqual(['self.json']);
  });

  test('malformed JSON files are counted as kept and left in place', async () => {
    await fse.writeFile(path.join(tmpDir, 'broken.json'), 'this is not json {');
    await writeSession(tmpDir, 'anon-1', { cookie: {} });

    const result = await sweepAnonymousSessions(tmpDir, null);
    expect(result.removed).toBe(1);    // anon-1 deleted
    expect(result.kept).toBe(1);       // broken.json preserved (operator can investigate)
    expect(result.orphansRemoved).toBe(0);

    const remaining = (await fse.readdir(tmpDir)).sort();
    expect(remaining).toEqual(['anon-1.json'].filter(Boolean).length === 0 ? ['broken.json'] : ['broken.json']);
  });

  test('ignores non-session files in the directory', async () => {
    await fse.writeFile(path.join(tmpDir, 'README.md'), '# notes');
    await fse.writeFile(path.join(tmpDir, '.DS_Store'), '');
    await writeSession(tmpDir, 'anon-1', { cookie: {} });

    const result = await sweepAnonymousSessions(tmpDir, null);
    expect(result.removed).toBe(1);
    expect(result.kept).toBe(0);
    expect(result.orphansRemoved).toBe(0);

    const remaining = (await fse.readdir(tmpDir)).sort();
    expect(remaining).toEqual(['.DS_Store', 'README.md']);
  });

  test('empty session-store directory returns zeroes', async () => {
    const result = await sweepAnonymousSessions(tmpDir, null);
    expect(result).toEqual({ removed: 0, kept: 0, orphansRemoved: 0 });
  });
});
