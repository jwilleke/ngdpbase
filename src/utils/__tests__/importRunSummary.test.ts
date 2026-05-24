/**
 * Tests for the per-run summary persistence helpers (#738).
 *
 * Uses a real temp directory rather than mocking fs so the actual
 * read/write path runs (mirrors src/routes/__tests__/sweepAnonymousSessions.test.ts
 * approach from #777).
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fse from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  tallyWarnings,
  writeRunSummary,
  listRecentRuns,
  type ImportRunSummary
} from '../importRunSummary';

describe('tallyWarnings', () => {
  test('returns empty for undefined / empty input', () => {
    expect(tallyWarnings(undefined)).toEqual({});
    expect(tallyWarnings([])).toEqual({});
  });

  test('counts by kind, sums duplicates', () => {
    const out = tallyWarnings([
      { kind: 'img-rejected' },
      { kind: 'img-attached' },
      { kind: 'img-rejected' },
      { kind: 'link-externalized' },
      { kind: 'img-rejected' }
    ]);
    expect(out).toEqual({
      'img-rejected': 3,
      'img-attached': 1,
      'link-externalized': 1
    });
  });

  test('skips entries with missing/empty kind', () => {
    const out = tallyWarnings([
      { kind: 'img-attached' },
      { kind: '' },
       
      { } as any,
       
      null as any
    ]);
    expect(out).toEqual({ 'img-attached': 1 });
  });
});

describe('writeRunSummary + listRecentRuns', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `ngdpbase-import-runs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    if (tmpDir && tmpDir.includes('ngdpbase-import-runs-test-')) {
      await fse.remove(tmpDir);
    }
  });

  const sample = (overrides: Partial<ImportRunSummary> = {}): ImportRunSummary => ({
    runId: '2026-05-24T14-00-00Z',
    startedAt: '2026-05-24T14:00:00.000Z',
    finishedAt: '2026-05-24T14:00:05.000Z',
    importType: 'paste',
    actor: 'admin',
    total: 5,
    converted: 4,
    skipped: 1,
    failed: 0,
    kindCounts: { 'img-attached': 3, 'link-externalized': 2 },
    ...overrides
  });

  test('writes a summary to a new directory and reads it back', async () => {
    await writeRunSummary(tmpDir, sample());
    const runs = await listRecentRuns(tmpDir);
    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toBe('2026-05-24T14-00-00Z');
    expect(runs[0].kindCounts['img-attached']).toBe(3);
    expect(runs[0].actor).toBe('admin');
  });

  test('listRecentRuns returns newest first', async () => {
    await writeRunSummary(tmpDir, sample({
      runId: '2026-05-24T10-00-00Z',
      startedAt: '2026-05-24T10:00:00.000Z'
    }));
    await writeRunSummary(tmpDir, sample({
      runId: '2026-05-24T14-00-00Z',
      startedAt: '2026-05-24T14:00:00.000Z'
    }));
    await writeRunSummary(tmpDir, sample({
      runId: '2026-05-24T12-00-00Z',
      startedAt: '2026-05-24T12:00:00.000Z'
    }));
    const runs = await listRecentRuns(tmpDir);
    expect(runs.map(r => r.startedAt)).toEqual([
      '2026-05-24T14:00:00.000Z',
      '2026-05-24T12:00:00.000Z',
      '2026-05-24T10:00:00.000Z'
    ]);
  });

  test('listRecentRuns honors limit', async () => {
    for (let i = 0; i < 5; i++) {
      const hh = String(10 + i).padStart(2, '0');
      await writeRunSummary(tmpDir, sample({
        runId: `2026-05-24T${hh}-00-00Z`,
        startedAt: `2026-05-24T${hh}:00:00.000Z`
      }));
    }
    const runs = await listRecentRuns(tmpDir, 3);
    expect(runs).toHaveLength(3);
    expect(runs[0].startedAt).toBe('2026-05-24T14:00:00.000Z');
  });

  test('listRecentRuns returns [] for missing directory', async () => {
    const runs = await listRecentRuns(path.join(tmpDir, 'does-not-exist'));
    expect(runs).toEqual([]);
  });

  test('listRecentRuns skips malformed JSON files', async () => {
    await fse.ensureDir(tmpDir);
    await fse.writeFile(path.join(tmpDir, '2026-05-24T10-00-00Z.json'), '{not valid json');
    await writeRunSummary(tmpDir, sample({
      runId: '2026-05-24T14-00-00Z',
      startedAt: '2026-05-24T14:00:00.000Z'
    }));
    const runs = await listRecentRuns(tmpDir);
    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toBe('2026-05-24T14-00-00Z');
  });

  test('listRecentRuns ignores .tmp files (atomic-write artefacts)', async () => {
    await fse.ensureDir(tmpDir);
    await fse.writeFile(path.join(tmpDir, '2026-05-24T10-00-00Z.json.tmp'), '{}');
    await writeRunSummary(tmpDir, sample());
    const runs = await listRecentRuns(tmpDir);
    expect(runs).toHaveLength(1);
  });

  test('writeRunSummary records actor + isSystem for #631-style system principal', async () => {
    await writeRunSummary(tmpDir, sample({
      actor: 'System',
      isSystem: true,
      importType: 'ingest:volcano-feed'
    }));
    const runs = await listRecentRuns(tmpDir);
    expect(runs[0].actor).toBe('System');
    expect(runs[0].isSystem).toBe(true);
    expect(runs[0].importType).toBe('ingest:volcano-feed');
  });
});
