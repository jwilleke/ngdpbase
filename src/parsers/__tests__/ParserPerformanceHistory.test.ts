/**
 * The page-building history store (#2468): one JSON line per check, kept
 * 30 days, in day files that survive a restart.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import logger from '../../utils/logger';
import { ParserPerformanceHistory, rollupSamples, countChecks, type PerformanceSample } from '../ParserPerformanceHistory';

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

  test('open() says whether the folder is there: true when it is made, false when it could not be', async () => {
    const made = new ParserPerformanceHistory(path.join(dir, 'new-folder'));
    expect(await made.open()).toBe(true);
    expect(fs.existsSync(path.join(dir, 'new-folder'))).toBe(true);

    fs.writeFileSync(path.join(dir, 'a-file'), 'x');
    const blocked = new ParserPerformanceHistory(path.join(dir, 'a-file', 'inside'));
    expect(await blocked.open()).toBe(false);
  });

  test('a failed old-file removal does not make open() say the folder is missing', async () => {
    const stuck = path.join(dir, 'parser-performance-2020-01-01.jsonl');
    fs.mkdirSync(stuck);
    fs.writeFileSync(path.join(stuck, 'inside'), 'x');

    expect(await new ParserPerformanceHistory(dir).open()).toBe(true);
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

    await expect(store.open()).resolves.toBe(false);
    await expect(store.record(sample('2026-11-22T14:15:00.000Z'))).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  describe('a file name is built only from a real date (#2468, Low 4)', () => {
    test.each([
      ['a path in the date', '../../etc/passwd-2026-11-22T14:15:00.000Z'],
      ['letters in the date', '2026-11-2a'],
      ['not a date', 'banana'],
      ['an empty string', ''],
      ['a short date', '2026-1-2T00:00:00.000Z']
    ])('%s is dropped with a warning and no file is made', async (_label, t) => {
      const store = new ParserPerformanceHistory(dir);
      await store.open();
      await store.record(sample(t));

      expect(fs.readdirSync(dir)).toEqual([]);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    test.each([
      ['month 99 and day 99', '9999-99-99T00:00:00.000Z'],
      ['day 30 of February', '2026-02-30T10:00:00.000Z'],
      ['month 13', '2026-13-01T10:00:00.000Z'],
      ['day 00', '2026-11-00T10:00:00.000Z']
    ])('a date that cannot exist (%s) is dropped with a warning and no file is made', async (_label, t) => {
      const store = new ParserPerformanceHistory(dir);
      await store.open();
      await store.record(sample(t));

      expect(fs.readdirSync(dir)).toEqual([]);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    test('29 February of a leap year is kept; of another year it is not', async () => {
      const store = new ParserPerformanceHistory(dir);
      await store.open();
      await store.record(sample('2028-02-29T10:00:00.000Z'));
      await store.record(sample('2026-02-29T10:00:00.000Z'));

      expect(fs.readdirSync(dir)).toEqual(['parser-performance-2028-02-29.jsonl']);
    });

    test('a good check after a refused one is still kept', async () => {
      const store = new ParserPerformanceHistory(dir);
      await store.open();
      await store.record(sample('../x'));
      await store.record(sample('2026-11-22T14:15:00.000Z'));

      expect(fs.readdirSync(dir)).toEqual(['parser-performance-2026-11-22.jsonl']);
    });
  });

  describe('pruning cannot stop a check from being kept (#2468, Low 3)', () => {
    /** A "day file" that is a non-empty folder: removing it without recursion fails. */
    function stuckOldFiles() {
      for (const d of [1, 3, 5, 7, 9]) {
        const stuck = path.join(dir, `parser-performance-2020-01-0${d}.jsonl`);
        fs.mkdirSync(stuck);
        fs.writeFileSync(path.join(stuck, 'inside'), 'x');
        fs.writeFileSync(path.join(dir, `parser-performance-2020-01-1${d}.jsonl`), '{}\n');
      }
    }
    const stuckNames = ['01', '03', '05', '07', '09'].map((d) => `parser-performance-2020-01-${d}.jsonl`);

    test('a failed removal does not stop the append', async () => {
      let now = Date.parse('2026-11-23T12:00:00.000Z');
      const store = new ParserPerformanceHistory(dir, () => now);
      await store.open();
      stuckOldFiles();

      now += DAY;
      await store.record(sample(new Date(now).toISOString()));

      const kept = fs.readFileSync(path.join(dir, 'parser-performance-2026-11-24.jsonl'), 'utf8');
      expect(kept.trimEnd().split('\n')).toHaveLength(1);
    });

    test('a failed removal does not stop the next files from being removed', async () => {
      stuckOldFiles();
      const store = new ParserPerformanceHistory(dir, () => Date.parse('2026-11-23T12:00:00.000Z'));
      await store.open();

      expect(fs.readdirSync(dir).sort()).toEqual(stuckNames);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('a crash mid-write loses at most the torn line (#2468)', () => {
    test('the next check starts on a new line, so it is not joined to the torn fragment', async () => {
      const file = path.join(dir, 'parser-performance-2026-11-22.jsonl');
      fs.writeFileSync(file, JSON.stringify(sample('2026-11-22T14:14:00.000Z')) + '\n{"t":"2026-11-22T14:15:00.000Z","pa');

      const store = new ParserPerformanceHistory(dir);
      await store.open();
      await store.record(sample('2026-11-22T14:16:00.000Z'));
      await store.record(sample('2026-11-22T14:17:00.000Z'));

      const read = await store.read();
      expect(read.map((s) => s.t)).toEqual(['2026-11-22T14:14:00.000Z', '2026-11-22T14:16:00.000Z', '2026-11-22T14:17:00.000Z']);
    });

    test('a file that ends in a new line gets no blank line', async () => {
      const store = new ParserPerformanceHistory(dir);
      await store.open();
      await store.record(sample('2026-11-22T14:14:00.000Z'));
      await store.record(sample('2026-11-22T14:15:00.000Z'));

      const text = fs.readFileSync(path.join(dir, 'parser-performance-2026-11-22.jsonl'), 'utf8');
      expect(text.split('\n')).toHaveLength(3); // two lines and the empty piece after the last newline
    });
  });

  describe('read(since) opens only the day files that can matter (#2468)', () => {
    test('days wholly before the start are not read', async () => {
      const store = new ParserPerformanceHistory(dir);
      await store.open();
      await store.record(sample('2026-11-20T10:00:00.000Z'));
      await store.record(sample('2026-11-22T10:00:00.000Z'));
      await store.record(sample('2026-11-23T10:00:00.000Z'));

      const read = await store.read(Date.parse('2026-11-22T00:00:00.000Z'));
      expect(read.map((s) => s.t)).toEqual(['2026-11-22T10:00:00.000Z', '2026-11-23T10:00:00.000Z']);
    });
  });
});

describe('rollupSamples (#2468)', () => {
  const NOW = Date.parse('2026-11-23T12:00:00.000Z');
  const HOUR = 60 * 60 * 1000;
  const at = (msBefore: number, over: Partial<PerformanceSample> = {}): PerformanceSample =>
    sample(new Date(NOW - msBefore).toISOString(), over);

  test('p50, p95 (nearest rank), max and plain mean of a known set', () => {
    const samples = Array.from({ length: 20 }, (_, i) => at((i + 1) * 60 * 1000, { parse: i + 1, hit: null, err: null }));
    const parse = rollupSamples(samples, NOW).hour.parse;

    expect(parse).toEqual({ count: 20, p50: 10, p95: 19, max: 20, mean: 10.5 });
  });

  test('the low end: the lowest value and the 1-in-20 from the bottom (nearest rank)', () => {
    const samples = Array.from({ length: 20 }, (_, i) => at((i + 1) * 60 * 1000, { parse: null, hit: (i + 1) / 100, err: null }));
    const hit = rollupSamples(samples, NOW).hour.hit;

    expect(hit).toMatchObject({ count: 20, min: 0.01, p5: 0.01, max: 0.2, p95: 0.19 });
    expect(rollupSamples([at(1000, { hit: 0.7 })], NOW).hour.hit).toMatchObject({ min: 0.7, p5: 0.7 });
  });

  test('nearest rank on an odd count and on a single value', () => {
    const five = [5, 1, 4, 2, 3].map((v) => at(60 * 1000, { parse: v }));
    expect(rollupSamples(five, NOW).hour.parse).toMatchObject({ count: 5, p50: 3, p95: 5, max: 5, mean: 3 });
    expect(rollupSamples([at(1000, { parse: 7 })], NOW).hour.parse).toEqual({ count: 1, p50: 7, p95: 7, max: 7, mean: 7 });
  });

  test('a null measure is skipped, not counted as zero', () => {
    const samples = [
      at(1000, { parse: 100, hit: null, err: null }),
      at(2000, { parse: null, hit: 0.5, err: 0 }),
      at(3000, { parse: 200, hit: null, err: null })
    ];
    const hour = rollupSamples(samples, NOW).hour;

    expect(hour.parse).toMatchObject({ count: 2, mean: 150, max: 200 });
    expect(hour.hit).toMatchObject({ count: 1, p50: 0.5 });
    expect(hour.err).toMatchObject({ count: 1, max: 0, mean: 0 });
  });

  test('a window with no checks, or only nulls, is null', () => {
    expect(rollupSamples([], NOW).month).toEqual({ parse: null, hit: null, err: null });
    const onlyNull = [at(1000, { parse: null, hit: null, err: null })];
    expect(rollupSamples(onlyNull, NOW).hour).toEqual({ parse: null, hit: null, err: null });
  });

  test('each window takes the last N hours, the edge included', () => {
    const samples = [
      at(HOUR, { parse: 1 }), // exactly 1 h old: in the hour
      at(HOUR + 1, { parse: 2 }), // a millisecond older: day, not hour
      at(24 * HOUR, { parse: 3 }),
      at(24 * HOUR + 1, { parse: 4 }),
      at(7 * 24 * HOUR, { parse: 5 }),
      at(7 * 24 * HOUR + 1, { parse: 6 }),
      at(30 * 24 * HOUR, { parse: 7 }),
      at(30 * 24 * HOUR + 1, { parse: 8 }) // outside every window
    ];
    const r = rollupSamples(samples, NOW);

    expect(r.hour.parse?.count).toBe(1);
    expect(r.day.parse?.count).toBe(3);
    expect(r.week.parse?.count).toBe(5);
    expect(r.month.parse?.count).toBe(7);
    expect(r.month.parse?.max).toBe(7);
  });

  test('a line that is not a check is ignored', () => {
    const odd = [
      { t: 'banana', parse: 999, hit: null, err: null, n: 1 },
      { parse: 999 },
      { t: new Date(NOW - 1000).toISOString(), parse: '5', hit: Number.NaN, err: Infinity, n: 1 },
      at(1000, { parse: 10, hit: null, err: null })
    ] as unknown as PerformanceSample[];
    const hour = rollupSamples(odd, NOW).hour;

    expect(hour.parse).toMatchObject({ count: 1, max: 10 });
    expect(hour.hit).toBeNull();
    expect(hour.err).toBeNull();
  });
});

describe('countChecks (#2468)', () => {
  const NOW = Date.parse('2026-11-23T12:00:00.000Z');
  const at = (ms: number) => new Date(NOW - ms).toISOString();

  test('counts every check in each window, whichever numbers it carried', () => {
    const checks = countChecks([
      sample(at(60_000), { parse: null, hit: null, err: null }),
      sample(at(2 * 60 * 60 * 1000)),
      sample(at(2 * DAY)),
      sample(at(20 * DAY)),
      sample(at(40 * DAY)),
      { t: 'not a date' }
    ], NOW);

    expect(checks).toEqual({ hour: 1, day: 2, week: 3, month: 4 });
  });
});
