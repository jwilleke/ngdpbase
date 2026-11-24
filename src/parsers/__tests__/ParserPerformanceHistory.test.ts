/**
 * The page-building history store (#2468): one JSON line per check, kept
 * 30 days, in day files that survive a restart.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import logger from '../../utils/logger';
import { ParserPerformanceHistory, type PerformanceSample } from '../ParserPerformanceHistory';

const DAY = 24 * 60 * 60 * 1000;

function sample(t: string, over: Partial<PerformanceSample> = {}): PerformanceSample {
  return { t, parse: 119.5, hit: 0.192, err: 0, n: 20, ...over };
}

describe('ParserPerformanceHistory (#2468)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-perf-'));
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    vi.spyOn(logger, 'info').mockImplementation(() => logger);
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test('a check is appended as one JSON line in that day\'s file', async () => {
    const store = new ParserPerformanceHistory(dir);
    await store.open();
    await store.record(sample('2026-11-22T14:15:00.000Z'));
    await store.record(sample('2026-11-22T14:16:00.000Z', { parse: null, hit: null, err: null, n: 3 }));

    const file = path.join(dir, 'parser-performance-2026-11-22.jsonl');
    const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ t: '2026-11-22T14:15:00.000Z', parse: 119.5, hit: 0.192, err: 0, n: 20 });
    expect(JSON.parse(lines[1])).toEqual({ t: '2026-11-22T14:16:00.000Z', parse: null, hit: null, err: null, n: 3 });
  });

  test('a second store opened on the same folder reads every line back (restart)', async () => {
    const first = new ParserPerformanceHistory(dir);
    await first.open();
    await first.record(sample('2026-11-22T23:59:00.000Z'));
    await first.record(sample('2026-11-23T00:01:00.000Z', { parse: 80 }));

    const second = new ParserPerformanceHistory(dir);
    await second.open();
    const read = await second.read();
    expect(read.map((s) => s.t)).toEqual(['2026-11-22T23:59:00.000Z', '2026-11-23T00:01:00.000Z']);
    expect(read[1].parse).toBe(80);
  });

  test('files older than 30 days are removed when the store opens; nothing else is', async () => {
    const now = Date.parse('2026-11-23T12:00:00.000Z');
    fs.writeFileSync(path.join(dir, 'parser-performance-2026-10-01.jsonl'), '{"t":"2026-10-01T00:00:00.000Z","parse":1,"hit":null,"err":null,"n":1}\n');
    fs.writeFileSync(path.join(dir, 'parser-performance-2026-10-23.jsonl'), '{"t":"2026-10-23T23:59:00.000Z","parse":1,"hit":null,"err":null,"n":1}\n');
    fs.writeFileSync(path.join(dir, 'parser-performance-2026-10-24.jsonl'), '{"t":"2026-10-24T13:00:00.000Z","parse":1,"hit":null,"err":null,"n":1}\n');
    fs.writeFileSync(path.join(dir, 'parser-performance-2026-11-20.jsonl'), '{"t":"2026-11-20T00:00:00.000Z","parse":1,"hit":null,"err":null,"n":1}\n');
    fs.writeFileSync(path.join(dir, 'legacy-alerts.json'), '{}');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep');

    const store = new ParserPerformanceHistory(dir, () => now);
    await store.open();

    expect(fs.readdirSync(dir).sort()).toEqual([
      'legacy-alerts.json',
      'notes.txt',
      'parser-performance-2026-10-24.jsonl',
      'parser-performance-2026-11-20.jsonl'
    ]);
  });

  test('old files are removed again once a day while the store stays open', async () => {
    let now = Date.parse('2026-11-23T12:00:00.000Z');
    const store = new ParserPerformanceHistory(dir, () => now);
    await store.open();
    fs.writeFileSync(path.join(dir, 'parser-performance-2026-10-01.jsonl'), '{}\n');

    now += 2 * 60 * 60 * 1000; // two hours on: not yet
    await store.record(sample(new Date(now).toISOString()));
    expect(fs.existsSync(path.join(dir, 'parser-performance-2026-10-01.jsonl'))).toBe(true);

    now += DAY; // a day on: pruned
    await store.record(sample(new Date(now).toISOString()));
    expect(fs.existsSync(path.join(dir, 'parser-performance-2026-10-01.jsonl'))).toBe(false);
  });

  test('a torn last line after a crash is ignored on read', async () => {
    const store = new ParserPerformanceHistory(dir);
    await store.open();
    await store.record(sample('2026-11-22T14:15:00.000Z'));
    fs.appendFileSync(path.join(dir, 'parser-performance-2026-11-22.jsonl'), '{"t":"2026-11-22T14:16:00.000Z","pa');

    const read = await new ParserPerformanceHistory(dir).read();
    expect(read).toHaveLength(1);
    expect(read[0].t).toBe('2026-11-22T14:15:00.000Z');
  });

  test('a write failure logs one warning and does not throw', async () => {
    const blocker = path.join(dir, 'not-a-folder');
    fs.writeFileSync(blocker, 'x');
    const store = new ParserPerformanceHistory(path.join(blocker, 'inside'));

    await expect(store.open()).resolves.toBeUndefined();
    await expect(store.record(sample('2026-11-22T14:15:00.000Z'))).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
