/** UpgradeCheckManager (#2301): each check runs once per version change, the result is recorded, and only a decision becomes an item. */
import fs from 'node:fs';
import path from 'node:path';
import UpgradeCheckManager, { type UpgradeCheck } from '../../managers/UpgradeCheckManager';
import logger from '../../utils/logger';
import { admin, cleanup, makeFixture, type Fixture } from '../../test-support/upgradeChecks';

describe('UpgradeCheckManager (#2301)', () => {
  let f: Fixture;
  let detects: number;
  let fixed: string[][];
  const check = (affected: string[], over: Partial<UpgradeCheck> = {}): UpgradeCheck => ({
    id: 'sample',
    since: '5.43.0',
    detect: async () => { detects += 1; return { affected, log: 'sample detail' }; },
    item: async () => ({ text: 'Something to do.', button: 'Do it' }),
    fix: async (a) => { fixed.push(a); },
    ...over
  });
  const manager = (...checks: UpgradeCheck[]) => {
    const m = new UpgradeCheckManager(f.engine);
    checks.forEach((c) => m.register(c));
    return m;
  };

  beforeEach(() => { f = makeFixture(); detects = 0; fixed = []; });
  afterEach(() => { cleanup(f); vi.restoreAllMocks(); });

  test('a check runs on the first start and not on later restarts', async () => {
    await manager(check(['x'])).runAtBoot();
    await manager(check(['x'])).runAtBoot();
    expect(detects).toBe(1);
    expect(fs.existsSync(path.join(f.dataDir, 'upgrade-checks.json'))).toBe(true);
  });

  test('a changed version (an update, a restore, a downgrade) runs it again', async () => {
    await manager(check([])).runAtBoot();
    f.props['ngdpbase.version'] = '5.44.0';
    await manager(check([])).runAtBoot();
    expect(detects).toBe(2);
  });

  test('a site older than the check\'s version skips it', async () => {
    await manager(check([], { since: '5.99.0' })).runAtBoot();
    expect(detects).toBe(0);
  });

  test('nothing affected: no item, and one log line', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const m = manager(check([]));
    await m.runAtBoot();
    expect(await m.openItems(admin)).toEqual([]);
    const lines = [...info.mock.calls, ...warn.mock.calls].map((c) => String(c[0])).filter((l) => l.includes('[UPGRADE]'));
    expect(lines).toEqual(['[UPGRADE] sample (5.43.0): sample detail']);
  });

  test('a decision is an item until its button runs; the fix gets the affected list and is not repeated', async () => {
    const m = manager(check(['x']));
    await m.runAtBoot();
    expect(await m.openItems(admin)).toEqual([{ id: 'sample', text: 'Something to do.', button: 'Do it' }]);
    expect(await m.applyFix('sample', admin)).toBe(true);
    expect(fixed).toEqual([['x']]);
    expect(await m.openItems(admin)).toEqual([]);
    expect(await m.applyFix('sample', admin)).toBe(false);
    expect(fixed).toHaveLength(1);
  });

  test('a fixed item stays fixed after a restart, and a check that throws is tried again next start', async () => {
    const m = manager(check(['x']));
    await m.runAtBoot();
    await m.applyFix('sample', admin);
    expect(await manager(check(['x'])).openItems(admin)).toEqual([]);

    detects = 0;
    const failing = manager(check(['x'], { id: 'flaky', detect: async () => { detects += 1; throw new Error('boom'); } }));
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    await failing.runAtBoot();
    await failing.runAtBoot();
    expect(detects).toBe(2);
  });

  test('an unknown id is refused', async () => {
    const m = manager(check(['x']));
    await m.runAtBoot();
    expect(await m.applyFix('nope', admin)).toBe(false);
  });
});
