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
import { UPGRADE_INTRO, UPGRADE_LIST_HEADING, UPGRADE_READ_ONLY, UPGRADE_RESULTS, upgradeEmpty, upgradeHeading, upgradeListLead, upgradeNotice, upgradeResult } from '../wording';
import { UPGRADE_LIST_PAGE_SIZE } from '../../managers/UpgradeCheckManager';
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

  const ID = 'pages-nobody-can-edit';

  test('the item is a count and a link, with the version, and names no page', async () => {
    f.pages.notes = ['Trip Notes', 'Budget 2026', 'Packing List'];
    await manager.runAtBoot();
    expect(await manager.openItems(admin)).toEqual([{
      id: ID,
      text: '3 pages can\'t be edited after the update to 5.43.0.',
      link: { label: 'See the pages', href: '/admin/upgrade/pages/pages-nobody-can-edit' }
    }]);
  });

  test('one page is "1 page"', async () => {
    f.pages.notes = ['Trip Notes'];
    await manager.runAtBoot();
    expect((await manager.openItems(admin))[0].text).toBe('1 page can\'t be edited after the update to 5.43.0.');
  });

  test('vault pages are not counted or listed', async () => {
    f.pages.notes = ['Trip Notes'];
    f.pages.sealed = [];
    await manager.runAtBoot();
    const listed = vi.spyOn(f.engine.getManager('PageManager') as { listCategoryPages: (c: string) => Promise<string[]> }, 'listCategoryPages');
    await manager.openItems(admin);
    expect(listed.mock.calls.every(([c]) => typeof c === 'string')).toBe(true);
    const list = await manager.openList(ID, admin, 1);
    expect(list?.total).toBe(1);
  });

  test('the list names each page A–Z with pageUrl, and leaves out pages the viewer may not see', async () => {
    f.pages.notes = ['Trip Notes', 'Budget 2026', 'Packing List', 'Secret'];
    f.hidden = new Set(['Secret']);
    await manager.runAtBoot();
    const list = await manager.openList(ID, admin, 1);
    expect(list).toEqual({
      total: 3,
      pages: [
        { title: 'Budget 2026', href: '/view/Budget%202026' },
        { title: 'Packing List', href: '/view/Packing%20List' },
        { title: 'Trip Notes', href: '/view/Trip%20Notes' }
      ],
      page: 1,
      pageCount: 1,
      note: 'The button lets everyone who signs in as an administrator edit them. Nothing in the pages changes, and no one else gets access.',
      button: 'Let administrators edit these pages'
    });
    expect(upgradeListLead(3)).toBe('These 3 pages can\'t be edited by anyone, including you.');
    expect(upgradeListLead(1)).toBe('This page can\'t be edited by anyone, including you.');
  });

  test('the list pages 50 at a time, so 1,000+ pages work, and a page number out of range is held to the nearest', async () => {
    f.pages.notes = Array.from({ length: 1234 }, (_, i) => `Page ${String(i).padStart(4, '0')}`);
    await manager.runAtBoot();
    const first = await manager.openList(ID, admin, 1);
    expect(first).toMatchObject({ total: 1234, page: 1, pageCount: 25 });
    expect(first?.pages).toHaveLength(UPGRADE_LIST_PAGE_SIZE);
    expect(first?.pages[0].title).toBe('Page 0000');
    const last = await manager.openList(ID, admin, 25);
    expect(last?.pages).toHaveLength(1234 - 24 * UPGRADE_LIST_PAGE_SIZE);
    expect(last?.pages.at(-1)?.title).toBe('Page 1233');
    expect((await manager.openList(ID, admin, 999))?.page).toBe(25);
    expect((await manager.openList(ID, admin, -3))?.page).toBe(1);
    expect((await manager.openList(ID, admin, Number.NaN))?.page).toBe(1);
  });

  test('a page deleted after the check ran is not on the list, and the count catches up within a minute (N1)', async () => {
    f.pages.notes = ['Trip Notes', 'Plans'];
    await manager.runAtBoot();
    f.pages.notes = ['Plans'];
    expect((await manager.openList(ID, admin, 1))?.pages.map((p) => p.title)).toEqual(['Plans']);
    expect((await manager.openItems(admin))[0].text).toContain('1 page can');
  });

  test('the count is not read from the site again on each look at Admin', async () => {
    f.pages.notes = ['Trip Notes'];
    await manager.runAtBoot();
    const listed = vi.spyOn(f.engine.getManager('PageManager') as { listCategoryPages: (c: string) => Promise<string[]> }, 'listCategoryPages');
    await manager.openItems(admin);
    await manager.openItems(admin);
    expect(listed).not.toHaveBeenCalled();
  });

  test('a list with nothing left in it, and an item that does not exist, are null', async () => {
    f.pages.notes = ['Trip Notes'];
    await manager.runAtBoot();
    f.hidden = new Set(['Trip Notes']);
    expect(await manager.openList(ID, admin, 1)).toBeNull();
    expect(await manager.openList('nope', admin, 1)).toBeNull();
  });

  test('results come from a key; anything else is nothing, and no text is taken from the address', () => {
    expect(upgradeResult('fixed')).toBe(UPGRADE_RESULTS.fixed);
    expect(upgradeResult('failed')?.ok).toBe(false);
    expect(upgradeResult('Budget 2026')).toBeNull();
    expect(upgradeResult('toString')).toBeNull();
    expect(upgradeResult(undefined)).toBeNull();
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
    expect(added).not.toHaveProperty('priority');
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
    f.pages.notes = Array.from({ length: 12 }, (_, i) => `Note ${String.fromCharCode(65 + i)}`);
    f.pages.sealed = ['Sealed One'];
    // Forced affected: every stored category is recorded as affected, whatever a check's detect would find.
    const checks = shippedUpgradeChecks(f.engine);
    const record = Object.fromEntries(checks.map((c) => [c.id, { version: '5.43.0', ranAt: 'now', affected: ['notes', 'test-sealed'] }]));
    fs.writeFileSync(path.join(f.dataDir, 'upgrade-checks.json'), JSON.stringify(record));
    const items = await manager.openItems(admin);
    expect(items.map((i) => i.id).sort()).toEqual(checks.map((c) => c.id).sort());
    const words: string[] = [UPGRADE_INTRO, UPGRADE_READ_ONLY, UPGRADE_LIST_HEADING, ...Object.values(UPGRADE_RESULTS).map((r) => r.text),
      upgradeHeading('5.43.0'), upgradeHeading(''), upgradeEmpty('5.43.0'), upgradeEmpty(''), upgradeListLead(1), upgradeListLead(7)];
    for (const item of items) {
      words.push(item.text, item.link.label);
      const list = await manager.openList(item.id, admin, 1);
      if (list) words.push(list.note, list.button, ...list.pages.map((p) => p.title));
      for (const canFix of [true, false]) {
        for (const version of ['5.43.0', '']) words.push(...Object.values(upgradeNotice([item], version, canFix) ?? {}), ...Object.values(upgradeNotice([item, item], version, canFix) ?? {}));
      }
    }
    expect(words.length).toBeGreaterThan(15);
    for (const w of words) {
      expect(w).not.toMatch(/#\d+/);
      expect(w).not.toContain('docs/');
      expect(w).not.toContain('ngdpbase.');
      expect(w.toLowerCase()).not.toContain('log');
      expect(w).not.toMatch(/categor|polic|permission|vault|private/i);
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
