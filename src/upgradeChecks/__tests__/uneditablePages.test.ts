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
import fs from 'node:fs';
import path from 'node:path';
import { UPGRADE_FIX_ERRORS, UPGRADE_INTRO, UPGRADE_READ_ONLY, itemSentence, upgradeEmpty, upgradeHeading, upgradeNotice } from '../wording';
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

  test('pages are named A–Z and linked when the viewer may see them, and counted when not', async () => {
    f.pages.notes = ['Trip Notes', 'Budget 2026', 'Packing List', 'private:bob/default/Diary', 'private:bob/default/Plans'];
    f.hidden = new Set(['private:bob/default/Diary', 'private:bob/default/Plans']);
    await manager.runAtBoot();
    const [item] = await manager.openItems(admin);
    expect(item).toEqual({
      id: 'pages-nobody-can-edit',
      headline: '5 pages can\'t be edited',
      text: 'These 5 pages can\'t be edited by anyone, including you: ',
      pages: [
        { title: 'Budget 2026', href: '/view/Budget%202026' },
        { title: 'Packing List', href: '/view/Packing%20List' },
        { title: 'Trip Notes', href: '/view/Trip%20Notes' }
      ],
      more: ' and 2 private pages',
      note: 'The button lets everyone who signs in as an administrator edit them. Nothing in the pages changes, and no one else gets access.',
      button: 'Let administrators edit these pages',
      done: 'Administrators can now edit Budget 2026, Packing List, Trip Notes and 2 private pages.'
    });
    expect(itemSentence(item)).toBe('These 5 pages can\'t be edited by anyone, including you: Budget 2026, Packing List, Trip Notes and 2 private pages.');
  });

  test('one page, and a page the viewer may not see by title', async () => {
    f.pages.notes = ['Trip Notes'];
    await manager.runAtBoot();
    const [one] = await manager.openItems(admin);
    expect(itemSentence(one)).toBe('This page can\'t be edited by anyone, including you: Trip Notes.');
    expect(one.button).toBe('Let administrators edit this page');
    expect(one.note).toContain('edit it. Nothing in the page changes');
    f.hidden = new Set(['Trip Notes']);
    expect(itemSentence((await manager.openItems(admin))[0])).toBe('This page can\'t be edited by anyone, including you.');
  });

  test('more than ten visible titles: the first ten A–Z, then a count, and the rest are not asked about', async () => {
    f.pages.notes = Array.from({ length: 13 }, (_, i) => `Page ${String.fromCharCode(65 + i)}`);
    await manager.runAtBoot();
    const asked = vi.spyOn(f.engine.getManager('PageManager') as { mayShowPage: (n: string) => Promise<boolean> }, 'mayShowPage');
    const [item] = await manager.openItems(admin);
    expect(item.pages.map((p) => p.title)).toEqual(Array.from({ length: 10 }, (_, i) => `Page ${String.fromCharCode(65 + i)}`));
    expect(item.more).toBe(' and 3 more pages');
    expect(asked).toHaveBeenCalledTimes(10);
  });

  test('the pages are listed when the check runs, not on each look at Admin', async () => {
    f.pages.notes = ['Trip Notes'];
    await manager.runAtBoot();
    const listed = vi.spyOn(f.engine.getManager('PageManager') as { listCategoryPages: (c: string) => Promise<string[]> }, 'listCategoryPages');
    await manager.openItems(admin);
    await manager.openItems(admin);
    expect(listed).not.toHaveBeenCalled();
  });

  test('the button adds a policy through setProperty as the person, and the item is gone without a restart', async () => {
    f.pages.notes = ['Trip Notes'];
    await manager.runAtBoot();
    expect(await manager.applyFix('pages-nobody-can-edit', admin)).toBe('Administrators can now edit Trip Notes.');
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

  test('everything an administrator reads from every registered check names no part of how the site is set up', async () => {
    f.pages.notes = [...Array.from({ length: 12 }, (_, i) => `Note ${String.fromCharCode(65 + i)}`), 'private:bob/default/Diary'];
    f.pages.sealed = ['Sealed One'];
    f.hidden = new Set(['private:bob/default/Diary']);
    // Forced affected: every stored category is recorded as affected, whatever a check's detect would find.
    const checks = shippedUpgradeChecks(f.engine);
    const record = Object.fromEntries(checks.map((c) => [c.id, { version: '5.43.0', ranAt: 'now', affected: ['notes', 'test-sealed'] }]));
    fs.writeFileSync(path.join(f.dataDir, 'upgrade-checks.json'), JSON.stringify(record));
    const items = await manager.openItems(admin);
    expect(items.map((i) => i.id).sort()).toEqual(checks.map((c) => c.id).sort());
    const words: string[] = [UPGRADE_INTRO, UPGRADE_READ_ONLY, UPGRADE_FIX_ERRORS.alreadyFixed, UPGRADE_FIX_ERRORS.failed,
      upgradeHeading('5.43.0'), upgradeHeading(''), upgradeEmpty('5.43.0'), upgradeEmpty('')];
    for (const item of items) {
      words.push(item.headline, item.text, ...item.pages.map((p) => p.title), item.more, item.note, item.button, item.done, itemSentence(item));
      for (const canFix of [true, false]) {
        for (const version of ['5.43.0', '']) words.push(...Object.values(upgradeNotice([item], version, canFix) ?? {}), ...Object.values(upgradeNotice([item, item], version, canFix) ?? {}));
      }
    }
    expect(words.length).toBeGreaterThan(20);
    for (const w of words) {
      expect(w).not.toMatch(/#\d+/);
      expect(w).not.toContain('docs/');
      expect(w).not.toContain('ngdpbase.');
      expect(w.toLowerCase()).not.toContain('log');
      expect(w).not.toMatch(/categor|polic|permission/i);
    }
  });

  test('the dashboard notice leads with the item, and does not ask a read-only administrator to decide', async () => {
    f.pages.notes = ['Trip Notes', 'Plans'];
    await manager.runAtBoot();
    const items = await manager.openItems(admin);
    expect(upgradeNotice(items, '5.43.0', true)).toEqual({ text: '2 pages can\'t be edited after the update to 5.43.0.', link: 'Review and fix' });
    expect(upgradeNotice(items, '5.43.0', false)).toEqual({ text: '2 pages can\'t be edited after the update to 5.43.0.', link: 'Review' });
    expect(upgradeNotice([...items, ...items, ...items], '5.43.0', true)?.text).toBe('The update to 5.43.0 needs 3 decisions from you.');
    expect(upgradeNotice([...items, ...items], '5.43.0', false)?.text).toContain('from an administrator who can change site settings');
    expect(upgradeNotice([], '5.43.0', true)).toBeNull();
  });
});
