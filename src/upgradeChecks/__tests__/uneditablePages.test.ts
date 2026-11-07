/**
 * The first upgrade check (#2299): pages nobody can edit.
 *
 * `shippedUpgradeChecks` is every check a release registers; the wording test
 * runs each one over pages whose titles are plain, so a check whose text names
 * the site's set-up (an issue number, a docs path, a config key, the log) fails here.
 */
import UpgradeCheckManager from '../../managers/UpgradeCheckManager';
import { shippedUpgradeChecks } from '../index';
import logger from '../../utils/logger';
import { admin, cleanup, makeFixture, type Fixture } from '../../test-support/upgradeChecks';

describe('pages nobody can edit (#2299)', () => {
  let f: Fixture;
  let manager: UpgradeCheckManager;
  beforeEach(async () => {
    f = makeFixture();
    vi.spyOn(logger, 'info').mockImplementation(() => logger);
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    manager = new UpgradeCheckManager(f.engine);
    shippedUpgradeChecks(f.engine).forEach((c) => manager.register(c));
  });
  afterEach(() => { cleanup(f); vi.restoreAllMocks(); });

  test('an uncovered category with no pages shows nothing and writes one line', async () => {
    await manager.runAtBoot();
    expect(await manager.openItems(admin)).toEqual([]);
    const lines = [...vi.mocked(logger.info).mock.calls, ...vi.mocked(logger.warn).mock.calls].map((c) => String(c[0])).filter((l) => l.includes('[UPGRADE]'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('test-sealed');
  });

  test('categories that are covered, or never stored, are not looked at', async () => {
    f.pages.general = ['Home'];
    f.pages.capture = ['Snap'];
    await manager.runAtBoot();
    expect(await manager.openItems(admin)).toEqual([]);
  });

  test('pages are named when the viewer may see them and counted when not', async () => {
    f.pages.notes = ['Trip Notes', 'Budget 2026', 'Packing List', 'private:bob/default/Diary', 'private:bob/default/Plans'];
    f.hidden = new Set(['private:bob/default/Diary', 'private:bob/default/Plans']);
    await manager.runAtBoot();
    expect(await manager.openItems(admin)).toEqual([{
      id: 'pages-nobody-can-edit',
      text: 'These 5 pages can\'t be edited by anyone, including you: Trip Notes, Budget 2026, Packing List and 2 private pages.',
      button: 'Let admins edit them'
    }]);
  });

  test('one page, and a page the viewer may not see by title', async () => {
    f.pages.notes = ['Trip Notes'];
    await manager.runAtBoot();
    expect((await manager.openItems(admin))[0]).toMatchObject({ text: 'This page can\'t be edited by anyone, including you: Trip Notes.', button: 'Let admins edit it' });
    f.hidden = new Set(['Trip Notes']);
    expect((await manager.openItems(admin))[0].text).toBe('This page can\'t be edited by anyone, including you.');
  });

  test('the button adds a policy through setProperty as the person, and the item is gone without a restart', async () => {
    f.pages.notes = ['Trip Notes'];
    await manager.runAtBoot();
    expect(await manager.applyFix('pages-nobody-can-edit', admin)).toBe(true);
    expect(f.saved).toHaveLength(1);
    expect(f.saved[0].ctx).toBe(admin);
    expect(f.saved[0].key).toBe('ngdpbase.access.policies');
    const added = (f.saved[0].value as Array<{ id: string; actions: string[]; resources: Array<{ pattern: string }>; subjects: Array<{ type: string; value: string }> }>)
      .find((p) => p.id === 'admins-edit-pages-no-one-could');
    expect(added).toMatchObject({ actions: ['page-edit'], subjects: [{ type: 'role', value: 'admin' }], resources: [{ type: 'system-category', pattern: 'notes' }] });
    expect(await manager.openItems(admin)).toEqual([]);
  });

  test('an item whose category was covered another way meanwhile is not shown', async () => {
    f.pages.notes = ['Trip Notes'];
    await manager.runAtBoot();
    (f.props['ngdpbase.access.policies'] as unknown[]).push({ id: 'mine', actions: ['page-edit'], resources: [{ type: 'system-category', pattern: 'notes' }] });
    expect(await manager.openItems(admin)).toEqual([]);
  });

  test('a policy the checks refuse is not saved and the item stays', async () => {
    f.pages.notes = ['Trip Notes'];
    await manager.runAtBoot();
    f.policyProblems = ['bad'];
    await expect(manager.applyFix('pages-nobody-can-edit', admin)).rejects.toThrow('Policies not saved: bad');
    expect(f.saved).toHaveLength(0);
    expect(await manager.openItems(admin)).toHaveLength(1);
  });

  test('no registered check\'s text or button names how the site is set up', async () => {
    const titles = ['Trip Notes', 'Budget 2026', 'Packing List'];
    f.pages.notes = [...titles, 'private:bob/default/Diary'];
    f.pages.sealed = ['Sealed One'];
    f.hidden = new Set(['private:bob/default/Diary']);
    await manager.runAtBoot();
    const items = await manager.openItems(admin);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      for (const words of [item.text, item.button]) {
        expect(words).not.toMatch(/#\d+/);
        expect(words).not.toContain('docs/');
        expect(words).not.toContain('ngdpbase.');
        expect(words.toLowerCase()).not.toContain('log');
        expect(words).not.toMatch(/categor|polic|permission/i);
      }
    }
  });
});
