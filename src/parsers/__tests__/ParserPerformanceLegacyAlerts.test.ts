/**
 * The old "MarkupParser Performance Alert" notifications (#2468): their numbers are kept
 * in a file of their own first, and only then are the notifications deleted.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import logger from '../../utils/logger';
import {
  importLegacyAlerts,
  legacyStats,
  LEGACY_TITLE_PREFIX,
  parseLegacyAlert,
  readLegacyAlerts,
  type LegacyAlertSource,
  type LegacySample
} from '../ParserPerformanceLegacyAlerts';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const alert = (type: string, message: string, createdAt: Date | string = new Date('2026-11-20T10:00:00.000Z')) => ({
  title: `${LEGACY_TITLE_PREFIX}${type}`,
  message,
  createdAt
});

describe('parseLegacyAlert (#2468)', () => {
  test('the three known message shapes', () => {
    const at = new Date('2026-11-20T10:00:00.000Z');
    expect(parseLegacyAlert(alert('SLOW_PARSING', 'Average parse time 119.50ms exceeds threshold 100ms', at)))
      .toEqual({ t: '2026-11-20T10:00:00.000Z', measure: 'parse', value: 119.5 });
    expect(parseLegacyAlert(alert('LOW_CACHE_HIT_RATIO', 'Cache hit ratio 19.2% below threshold 20.0%', at)))
      .toEqual({ t: '2026-11-20T10:00:00.000Z', measure: 'hit', value: 0.192 });
    expect(parseLegacyAlert(alert('HIGH_ERROR_RATE', 'Error rate 6.5% exceeds threshold 5.0%', at)))
      .toEqual({ t: '2026-11-20T10:00:00.000Z', measure: 'err', value: 0.065 });
  });

  test('a date stored as text is read', () => {
    expect(parseLegacyAlert(alert('SLOW_PARSING', 'Average parse time 120ms exceeds threshold 100ms', '2026-11-20T10:00:00.000Z'))?.t)
      .toBe('2026-11-20T10:00:00.000Z');
  });

  test('a message that does not match its title, or has no number, is not a sample', () => {
    expect(parseLegacyAlert(alert('SLOW_PARSING', 'Error rate 6.5% exceeds threshold 5.0%'))).toBeNull();
    expect(parseLegacyAlert(alert('SLOW_PARSING', 'Average parse time soon exceeds threshold'))).toBeNull();
    expect(parseLegacyAlert(alert('SOMETHING_ELSE', 'Average parse time 120ms exceeds threshold 100ms'))).toBeNull();
    expect(parseLegacyAlert(alert('SLOW_PARSING', 'Average parse time 120ms', 'not a date'))).toBeNull();
  });
});

describe('legacyStats (#2468)', () => {
  const sample = (daysAgo: number, measure: LegacySample['measure'], value: number): LegacySample => ({
    t: new Date(NOW - daysAgo * 24 * 60 * 60 * 1000).toISOString(), measure, value
  });

  test('only the last 30 days count, per measure', () => {
    const stats = legacyStats([
      sample(1, 'parse', 110), sample(2, 'parse', 130), sample(31, 'parse', 9999), sample(3, 'hit', 0.1)
    ], NOW);

    expect(stats.parse).toMatchObject({ count: 2, max: 130, mean: 120 });
    expect(stats.hit).toMatchObject({ count: 1, max: 0.1 });
    expect(stats.err).toBeNull();
  });
});

describe('importLegacyAlerts (#2468)', () => {
  let dir: string;
  let events: string[];
  let stored: ReturnType<typeof alert>[];
  let source: LegacyAlertSource;
  const legacyFile = () => path.join(dir, 'legacy-alerts.json');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-legacy-'));
    events = [];
    stored = [
      alert('SLOW_PARSING', 'Average parse time 119.50ms exceeds threshold 100ms'),
      alert('LOW_CACHE_HIT_RATIO', 'Cache hit ratio 19.2% below threshold 20.0%'),
      alert('HIGH_ERROR_RATE', 'Error rate 6.5% exceeds threshold 5.0%'),
      alert('SLOW_PARSING', 'garbled message'),
      { title: 'Media files without a capture date', message: 'Average parse time 1ms', createdAt: new Date() }
    ];
    source = {
      getAllNotifications: vi.fn(() => stored),
      removeByTitles: vi.fn(async (titles: readonly string[]) => {
        events.push(`removed:file-present=${fs.existsSync(legacyFile())}`);
        const before = stored.length;
        stored = stored.filter((n) => !titles.includes(n.title));
        return before - stored.length;
      })
    };
    vi.spyOn(logger, 'info').mockImplementation(() => logger);
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test('imports the known shapes, counts the one it cannot read, and ignores other titles', async () => {
    const result = await importLegacyAlerts(dir, source, NOW);

    expect(result).toEqual({ imported: 3, skipped: 1, removed: 4 });
    const file = await readLegacyAlerts(dir);
    expect(file?.samples.map((s) => [s.measure, s.value])).toEqual([['parse', 119.5], ['hit', 0.192], ['err', 0.065]]);
    expect(file?.skipped).toBe(1);
    expect(file?.importedAt).toBe(new Date(NOW).toISOString());
  });

  test('the file is written before anything is deleted, and only the old alerts are deleted', async () => {
    await importLegacyAlerts(dir, source, NOW);

    expect(events).toEqual(['removed:file-present=true']);
    expect(source.removeByTitles).toHaveBeenCalledWith([
      'MarkupParser Performance Alert: SLOW_PARSING',
      'MarkupParser Performance Alert: LOW_CACHE_HIT_RATIO',
      'MarkupParser Performance Alert: HIGH_ERROR_RATE'
    ]);
    expect(stored.map((n) => n.title)).toEqual(['Media files without a capture date']);
  });

  test('a notification whose title only starts like an old alert is neither counted nor deleted', async () => {
    stored.push(
      { title: 'MarkupParser Performance Alert: SLOW_PARSING (copy)', message: 'Average parse time 1ms', createdAt: new Date() },
      { title: 'MarkupParser Performance Alert: SOMETHING_ELSE', message: 'x', createdAt: new Date() },
      { title: 'MarkupParser Performance Alert: ', message: 'x', createdAt: new Date() }
    );

    const result = await importLegacyAlerts(dir, source, NOW);

    expect(result).toEqual({ imported: 3, skipped: 1, removed: 4 });
    expect(stored.map((n) => n.title)).toEqual([
      'Media files without a capture date',
      'MarkupParser Performance Alert: SLOW_PARSING (copy)',
      'MarkupParser Performance Alert: SOMETHING_ELSE',
      'MarkupParser Performance Alert: '
    ]);
  });

  test('after the removal the file says when and how many; no stray temporary file is left', async () => {
    await importLegacyAlerts(dir, source, NOW);

    const file = await readLegacyAlerts(dir);
    expect(file?.removedAt).toBe(new Date(NOW).toISOString());
    expect(file?.removed).toBe(4);
    expect(fs.readdirSync(dir)).toEqual(['legacy-alerts.json']);
  });

  test('one log line says what happened', async () => {
    await importLegacyAlerts(dir, source, NOW);

    const lines = (logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => l.includes('imported 3, skipped 1, removed 4'))).toHaveLength(1);
  });

  test('a second run does nothing', async () => {
    await importLegacyAlerts(dir, source, NOW);
    const before = fs.readFileSync(legacyFile(), 'utf8');
    stored.push(alert('SLOW_PARSING', 'Average parse time 300ms exceeds threshold 100ms'));
    (source.removeByTitles as ReturnType<typeof vi.fn>).mockClear();

    const again = await importLegacyAlerts(dir, source, NOW + 60_000);

    expect(again).toBeNull();
    expect(source.removeByTitles).not.toHaveBeenCalled();
    expect(fs.readFileSync(legacyFile(), 'utf8')).toBe(before);
  });

  test('a crash after the file was written retries only the removal, and imports nothing twice', async () => {
    // First start: the removal fails, as if the process died there.
    (source.removeByTitles as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('crash'));
    await importLegacyAlerts(dir, source, NOW);
    const afterCrash = await readLegacyAlerts(dir);
    expect(afterCrash?.removedAt).toBeUndefined();
    expect(afterCrash?.samples).toHaveLength(3);
    expect(stored).toHaveLength(5);

    // Next start: the alerts are still there; they are removed, and the samples are the same three.
    stored.push(alert('SLOW_PARSING', 'Average parse time 300ms exceeds threshold 100ms'));
    const retry = await importLegacyAlerts(dir, source, NOW + 60_000);

    expect(retry).toEqual({ imported: 0, skipped: 0, removed: 5 });
    const done = await readLegacyAlerts(dir);
    expect(done?.samples).toHaveLength(3);
    expect(done?.importedAt).toBe(new Date(NOW).toISOString());
    expect(done?.removedAt).toBe(new Date(NOW + 60_000).toISOString());
    expect(stored.map((n) => n.title)).toEqual(['Media files without a capture date']);
  });

  test('nothing is deleted when the file cannot be written', async () => {
    const blocked = path.join(dir, 'a-file');
    fs.writeFileSync(blocked, 'x');

    await expect(importLegacyAlerts(path.join(blocked, 'inside'), source, NOW)).resolves.toBeNull();

    expect(source.removeByTitles).not.toHaveBeenCalled();
    expect(stored).toHaveLength(5);
  });

  test('a file that cannot be read is left alone and nothing is deleted', async () => {
    fs.writeFileSync(legacyFile(), '{ not json');

    await expect(importLegacyAlerts(dir, source, NOW)).resolves.toBeNull();

    expect(fs.readFileSync(legacyFile(), 'utf8')).toBe('{ not json');
    expect(source.removeByTitles).not.toHaveBeenCalled();
    expect(stored).toHaveLength(5);
  });

  test('a site with no old alerts still gets its marker, so the check is not repeated', async () => {
    stored = [];
    const result = await importLegacyAlerts(dir, source, NOW);

    expect(result).toEqual({ imported: 0, skipped: 0, removed: 0 });
    expect((await readLegacyAlerts(dir))?.removedAt).toBeDefined();
  });
});
