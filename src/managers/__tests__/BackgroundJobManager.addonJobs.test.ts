/**
 * #1998: what an add-on's scheduled job needs from core to work in the site's
 * time zone, and to ship paused.
 *
 * - `BackgroundJobManager.scheduleTimeZone()` is the zone the scheduler runs
 *   a schedule in when the schedule names none (`ngdpbase.default.timezone`);
 * - `host.zonedParts(slot, zone)` gives the slot's local year and month, so a
 *   job finds its local month with no Intl code of its own;
 * - an add-on's own `config/default-config.json` ships its job paused with
 *   `ngdpbase.jobs.<id>.enabled: false`, through the add-on config layer, and
 *   the site's own value (Admin → Scheduled Jobs → Resume) turns it on.
 *
 * State lives in a FileJobStateProvider in a temporary directory, removed by
 * each test (only that directory).
 */
vi.unmock('../BackgroundJobManager');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BackgroundJobManager, { type JobDefinition } from '../BackgroundJobManager';
import FileJobStateProvider from '../../providers/FileJobStateProvider';
import { mergeWithAddonLayer } from '../../utils/addonConfigLayer';
import { buildAddonHost } from '../../utils/addonHost';

let dir: string;
let clock: number;
let settings: Record<string, unknown>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1998-'));
  clock = Date.parse('2026-10-31T15:00:00Z');
  settings = {};
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function manager(): BackgroundJobManager {
  const engine = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return { getProperty: (key: string, fallback: unknown) => (key in settings ? settings[key] : fallback) };
      return null;
    }
  } as never;
  return new BackgroundJobManager(engine, { stateProvider: new FileJobStateProvider(path.join(dir, 'jobs'), { now: () => clock }), now: () => new Date(clock) });
}

/** The add-on's job: which local month its slot falls in, through the host and the scheduler's zone. */
function monthlyJob(jobs: BackgroundJobManager, seen: string[]): JobDefinition {
  const host = buildAddonHost('accounting-dues', {});
  return {
    id: 'accounting-dues.issue-invoices',
    displayName: 'Issue invoices',
    schedule: 'start-of-month 00:30',
    run: async (_progress, ctx) => {
      const { year, month } = host.zonedParts(new Date(ctx.slot as string), jobs.scheduleTimeZone());
      seen.push(`${year}-${String(month).padStart(2, '0')}`);
      return { success: true };
    }
  };
}

async function runDueSlot(jobs: BackgroundJobManager): Promise<void> {
  await jobs.tick();
  clock = Date.parse('2026-10-31T15:30:05Z');
  await jobs.tick();
  await jobs.whenIdle();
}

describe('the scheduler\'s time zone (#1998)', () => {
  test('is ngdpbase.default.timezone, and UTC when it is not set', () => {
    expect(manager().scheduleTimeZone()).toBe('UTC');
    settings['ngdpbase.default.timezone'] = 'Asia/Tokyo';
    expect(manager().scheduleTimeZone()).toBe('Asia/Tokyo');
  });

  test('is the zone a schedule that names none runs in', async () => {
    settings['ngdpbase.default.timezone'] = 'Asia/Tokyo';
    const jobs = manager();
    jobs.registerJob({ id: 'accounting-dues.issue-invoices', displayName: 'Issue invoices', schedule: 'start-of-month 00:30', run: async () => ({ success: true }) });
    expect((await jobs.scheduledJobView('accounting-dues.issue-invoices'))?.timeZone).toBe(jobs.scheduleTimeZone());
  });

  test('an add-on job finds its slot\'s local month through host.zonedParts, not the UTC month', async () => {
    // 00:30 on 1 November in Tokyo is 15:30 on 31 October in UTC.
    settings['ngdpbase.default.timezone'] = 'Asia/Tokyo';
    const jobs = manager();
    const seen: string[] = [];
    jobs.registerJob(monthlyJob(jobs, seen));
    await runDueSlot(jobs);
    expect(seen).toEqual(['2026-11']);
  });
});

describe('an add-on ships its job paused (#1998)', () => {
  const shipped = { 'ngdpbase.addons.accounting-dues.enabled': true };
  const addon = {
    slug: 'accounting-dues', dir: '', source: 'directory' as const, enabled: true,
    defaults: { 'ngdpbase.jobs.accounting-dues.issue-invoices.enabled': false }
  };

  test('its default-config.json key reaches the scheduler: no slot runs, and the admin page shows it paused', async () => {
    settings = mergeWithAddonLayer(shipped, [addon], {}).merged;
    settings['ngdpbase.default.timezone'] = 'Asia/Tokyo';
    const jobs = manager();
    const seen: string[] = [];
    jobs.registerJob(monthlyJob(jobs, seen));
    await runDueSlot(jobs);
    expect(seen).toEqual([]);
    expect((await jobs.scheduledJobView('accounting-dues.issue-invoices'))?.enabled).toBe(false);
  });

  test('the site turns it on: its own value (what Resume writes) wins over the add-on\'s', async () => {
    settings = mergeWithAddonLayer(shipped, [addon], { 'ngdpbase.jobs.accounting-dues.issue-invoices.enabled': true }).merged;
    settings['ngdpbase.default.timezone'] = 'Asia/Tokyo';
    const jobs = manager();
    const seen: string[] = [];
    jobs.registerJob(monthlyJob(jobs, seen));
    await runDueSlot(jobs);
    expect(seen).toEqual(['2026-11']);
    expect((await jobs.scheduledJobView('accounting-dues.issue-invoices'))?.enabled).toBe(true);
  });

  test('a turned-off add-on\'s key does not reach the scheduler', () => {
    const merged = mergeWithAddonLayer({}, [{ ...addon, enabled: false }], {}).merged;
    expect(merged['ngdpbase.jobs.accounting-dues.issue-invoices.enabled']).toBeUndefined();
  });
});
