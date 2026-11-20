/**
 * #2269 — a page that still carries an `access:` limit nothing reads any more
 * (#2255) is listed for the administrator in Admin → needs attention, at start
 * and again on save and delete, in plain words. The stamp install wrote on the
 * pages it ships outside `general` is not a limit anyone set, and is left out.
 */
vi.unmock('../PageManager');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import { formatPrivatePageName } from '../../utils/privateStorePath';
import { SeededShippedPages } from '../../utils/seededShippedPages';
import { withWriteDoorAllowing } from '../../__tests__/__fixtures__/pageWriteDoor';

type Meta = Record<string, unknown>;
interface Info { title: string; uuid: string; filePath: string; metadata: Meta }
interface TestManager {
  provider: unknown;
  reportLegacyAccessLimits(): Promise<number>;
  savePage(name: string, content: string, meta: unknown, ctx: unknown): Promise<unknown>;
  deletePage(name: string, ctx: unknown): Promise<boolean>;
  getManagerStatus(): Item;
  getAttentionItems(): Item[];
  markNeedsAttention(reason: string): boolean;
  markDegraded(reason: string): boolean;
}
type Item = { state: string; kind?: string; reason?: string; details?: string[] };
interface Harness {
  manager: TestManager;
  pages: Info[];
  /** The leftover-limit item as the dashboard reads it, or a ready stand-in when there is none. */
  status: () => Item;
}

const page = (title: string, uuid: string, metadata: Meta): Info => ({ title, uuid, filePath: `/x/${uuid}.md`, metadata: { title, uuid, ...metadata } });

describe('PageManager lists pages whose access: limit no longer applies (#2269)', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-legacy-access-2269-'));
  });
  afterEach(async () => {
    await fs.remove(folder); // this test's own temp dir only
  });

  async function harness(pages: Info[], shippedUuids: string[] = [], defaultCategory?: string): Promise<Harness> {
    const record = await SeededShippedPages.load(folder);
    for (const uuid of shippedUuids) record.add('required-pages', uuid);
    await record.save();
    const config = { getInstanceDataFolder: () => folder, getProperty: (_k: string, d: unknown) => d };
    const provider = {
      getAllPageInfo: vi.fn(async () => pages),
      getPage: vi.fn(async () => null),
      getPageMetadata: vi.fn(async () => null),
      savePage: vi.fn(async (name: string, _c: string, meta: Meta) => ({ name, uuid: String(meta.uuid) }))
    };
    const manager = new PageManager({
      getManager: vi.fn(withWriteDoorAllowing((name: string) => (name === 'ConfigurationManager' ? config : name === 'ValidationManager' && defaultCategory ? { getDefaultSystemCategory: () => defaultCategory } : null)))
    }) as unknown as TestManager;
    manager.provider = provider;
    return { manager, pages, status: () => manager.getAttentionItems()[0] ?? { state: 'ready' } };
  }

  test('names a general page limited to administrators, by count and title, as needs-attention', async () => {
    const h = await harness([page('Board Notes', 'u1', { 'system-category': 'general', access: { edit: ['admin'] } })]);
    expect(await h.manager.reportLegacyAccessLimits()).toBe(1);
    expect(h.status().state).toBe('degraded');
    expect(h.status().kind).toBe('attention');
    expect(h.status().reason).toMatch(/^1 page has /);
    expect(h.status().details).toEqual([expect.stringContaining('Board Notes')]);
    expect(h.status().details?.[0]).toMatch(/change/);
  });

  test('says what each page limited: reading, changing, or both', async () => {
    const h = await harness([
      page('Read Only Staff', 'u1', { 'system-category': 'general', access: { view: ['editor'] } }),
      page('Edit List', 'u2', { 'system-category': 'general', access: { edit: ['alice'] } }),
      page('Both', 'u3', { 'system-category': 'general', access: { view: ['a'], edit: ['b'] } })
    ]);
    expect(await h.manager.reportLegacyAccessLimits()).toBe(3);
    expect(h.status().reason).toMatch(/^3 pages have /);
    const [both, edit, read] = h.status().details ?? [];
    expect(both).toContain('Both');
    expect(both).toMatch(/read.*change|change.*read/);
    expect(edit).toContain('Edit List');
    expect(edit).not.toMatch(/read/);
    expect(read).toContain('Read Only Staff');
    expect(read).not.toMatch(/change/);
  });

  test('leaves out the stamp install wrote on a shipped page outside general', async () => {
    const h = await harness([page('Help', 'u1', { 'system-category': 'documentation', access: { edit: ['admin'] } })], ['u1']);
    expect(await h.manager.reportLegacyAccessLimits()).toBe(0);
    expect(h.status().state).toBe('ready');
  });

  test('lists the same stamp on a page install never shipped, or one in general', async () => {
    const h = await harness([
      page('My Journal Page', 'u1', { 'system-category': 'journal', access: { edit: ['admin'] } }),
      page('Shipped But General', 'u2', { 'system-category': 'general', access: { edit: ['admin'] } })
    ], ['u2']);
    expect(await h.manager.reportLegacyAccessLimits()).toBe(2);
  });

  test('a shipped page with more than the stamp is listed', async () => {
    const h = await harness([page('Help', 'u1', { 'system-category': 'documentation', access: { edit: ['admin'], view: ['admin'] } })], ['u1']);
    expect(await h.manager.reportLegacyAccessLimits()).toBe(1);
  });

  test('empty lists and pages with no access: are not listed', async () => {
    const h = await harness([
      page('A', 'u1', { 'system-category': 'general', access: { edit: [] } }),
      page('B', 'u2', { 'system-category': 'general' })
    ]);
    expect(await h.manager.reportLegacyAccessLimits()).toBe(0);
    expect(h.status().state).toBe('ready');
  });

  test('a private page is counted but its title stays off the list; a vault page is not counted', async () => {
    const h = await harness([
      page('Secret Plans', 'u1', { 'system-category': 'general', private: true, access: { view: ['editor'] } }),
      page(formatPrivatePageName('alice', 'notes', 'Vault Page'), 'u2', { 'system-category': 'general', access: { view: ['editor'] } }),
      page('Open Page', 'u3', { 'system-category': 'general', access: { view: ['editor'] } })
    ]);
    expect(await h.manager.reportLegacyAccessLimits()).toBe(2);
    const text = JSON.stringify(h.status());
    expect(text).not.toContain('Secret Plans');
    expect(text).not.toContain('Vault Page');
    expect(text).toContain('Open Page');
    expect(h.status().details?.join(' ')).toMatch(/1 private page/);
  });

  test('names the first 50 pages A to Z and counts the rest, so a long list stays readable', async () => {
    const pages = Array.from({ length: 53 }, (_, i) => page(`Page ${String(i).padStart(2, '0')}`, `u${i}`, { 'system-category': 'general', access: { view: ['editor'] } }));
    const h = await harness(pages);
    expect(await h.manager.reportLegacyAccessLimits()).toBe(53);
    expect(h.status().reason).toMatch(/^53 pages have /);
    const details = h.status().details ?? [];
    expect(details).toHaveLength(51);
    expect(details[0]).toContain('Page 00');
    expect(details[49]).toContain('Page 49');
    expect(details[50]).toMatch(/3 more pages/);
  });

  test('the text is plain: no issue numbers, file paths or log pointers', async () => {
    const h = await harness([page('Board Notes', 'u1', { 'system-category': 'general', access: { view: ['editor'] } })]);
    await h.manager.reportLegacyAccessLimits();
    const text = [h.status().reason, ...(h.status().details ?? [])].join(' ');
    expect(text).not.toMatch(/#\d|docs\/|github|\.md\b|log|frontmatter|access:/i);
    expect(text).toMatch(/Audience/);
    expect(text).toMatch(/Author Lock/);
  });

  test('saving the page without the limit takes it off the list; saving one with it puts it on', async () => {
    const h = await harness([page('Board Notes', 'u1', { 'system-category': 'general', access: { view: ['editor'] } })]);
    await h.manager.reportLegacyAccessLimits();
    expect(h.status().state).toBe('degraded');

    await h.manager.savePage('Board Notes', 'body', { title: 'Board Notes', uuid: 'u1', 'system-category': 'general' }, { username: 'jim' });
    expect(h.status().state).toBe('ready');

    await h.manager.savePage('Other', 'body', { title: 'Other', uuid: 'u9', 'system-category': 'general', access: { edit: ['alice'] } }, { username: 'jim' });
    expect(h.status().state).toBe('degraded');
    expect(h.status().reason).toMatch(/^1 page has /);
    expect(h.status().details?.[0]).toContain('Other');
  });

  test('deleting a listed page takes it off the list', async () => {
    const h = await harness([page('Board Notes', 'u1', { 'system-category': 'general', access: { view: ['editor'] } })]);
    const provider = h.manager.provider as { getPage: ReturnType<typeof vi.fn>; deletePage?: ReturnType<typeof vi.fn> };
    provider.getPage.mockResolvedValue({ name: 'Board Notes', uuid: 'u1', metadata: h.pages[0].metadata, content: '' });
    provider.deletePage = vi.fn(async () => true);
    await h.manager.reportLegacyAccessLimits();
    await h.manager.deletePage('Board Notes', { username: 'jim' });
    expect(h.status().state).toBe('ready');
  });

  test('never touches the manager\'s own status: the list is read live, not put in its one slot', async () => {
    const h = await harness([page('Board Notes', 'u1', { 'system-category': 'general', access: { view: ['editor'] } })]);
    await h.manager.reportLegacyAccessLimits();
    expect(h.manager.getManagerStatus().state).toBe('ready');
  });

  test('a vault outage survives a save of a page that carries access:', async () => {
    const h = await harness([]);
    h.manager.markDegraded('A private vault could not be opened.');
    await h.manager.savePage('Other', 'body', { title: 'Other', uuid: 'u9', 'system-category': 'general', access: { edit: ['alice'] } }, { username: 'jim' });
    expect(h.manager.getManagerStatus().state).toBe('degraded');
    expect(h.manager.getManagerStatus().kind).toBe('outage');
    expect(h.manager.getManagerStatus().reason).toBe('A private vault could not be opened.');
    expect(h.status().reason).toMatch(/^1 page has /);
  });

  test('the list survives a later vault or authorship report, and a save that takes the page off it clears only the list', async () => {
    const h = await harness([page('Board Notes', 'u1', { 'system-category': 'general', access: { view: ['editor'] } })]);
    await h.manager.reportLegacyAccessLimits();
    h.manager.markNeedsAttention('Some authorship could not be converted.');
    h.manager.markDegraded('A private vault could not be opened.');
    expect(h.status().details?.[0]).toContain('Board Notes');
    await h.manager.savePage('Board Notes', 'body', { title: 'Board Notes', uuid: 'u1', 'system-category': 'general' }, { username: 'jim' });
    expect(h.manager.getAttentionItems()).toEqual([]);
    expect(h.manager.getManagerStatus().reason).toBe('A private vault could not be opened.');
  });

  test('a private flag written as the string "true" keeps the title off the list, as the sitemap treats it', async () => {
    const h = await harness([page('Secret Plans', 'u1', { 'system-category': 'general', private: 'true', access: { view: ['editor'] } })]);
    expect(await h.manager.reportLegacyAccessLimits()).toBe(1);
    expect(JSON.stringify(h.status())).not.toContain('Secret Plans');
  });

  test('the private-page line tells the administrator the page\'s owner is who can act', async () => {
    const h = await harness([page('Secret Plans', 'u1', { 'system-category': 'general', private: true, access: { view: ['editor'] } })]);
    await h.manager.reportLegacyAccessLimits();
    const line = (h.status().details ?? []).find((d) => /private page/.test(d)) ?? '';
    expect(line).toMatch(/owner/i);
    expect(line).toMatch(/Audience or Author Lock/);
    expect(line).not.toMatch(/could read or change/);
  });

  test('each action is described as what it limited: read, change, delete, rename, create, upload, export', async () => {
    const h = await harness([
      page('A Export', 'u1', { 'system-category': 'general', access: { export: ['admin'] } }),
      page('B Create', 'u2', { 'system-category': 'general', access: { create: ['admin'] } }),
      page('C Upload', 'u3', { 'system-category': 'general', access: { upload: ['admin'] } }),
      page('D Read', 'u4', { 'system-category': 'general', access: { read: ['admin'] } }),
      page('E Mixed', 'u5', { 'system-category': 'general', access: { edit: ['a'], delete: ['a'], rename: ['a'], view: ['a'] } }),
      page('F Odd', 'u6', { 'system-category': 'general', access: { publish: ['a'] } })
    ]);
    await h.manager.reportLegacyAccessLimits();
    const [exp, create, upload, read, mixed, odd] = h.status().details ?? [];
    expect(exp).toMatch(/export/);
    expect(exp).not.toMatch(/change/);
    expect(create).toMatch(/create/);
    expect(create).not.toMatch(/change/);
    expect(upload).toMatch(/upload/);
    expect(upload).not.toMatch(/change/);
    expect(read).toMatch(/read/);
    expect(read).not.toMatch(/change/);
    expect(mixed).toMatch(/read/);
    expect(mixed).toMatch(/change/);
    expect(mixed).toMatch(/delete/);
    expect(mixed).toMatch(/rename/);
    expect(odd).toMatch(/use/);
  });

  test('a shipped stamp on a page with a padded or missing category is judged as the policy judges it', async () => {
    const h = await harness([
      page('Padded', 'u1', { 'system-category': 'general ', access: { edit: ['admin'] } }),
      page('Missing', 'u2', { access: { edit: ['admin'] } }),
      page('Docs', 'u3', { 'system-category': ' Documentation ', access: { edit: ['admin'] } })
    ], ['u1', 'u2', 'u3']);
    expect(await h.manager.reportLegacyAccessLimits()).toBe(2);
    const named = (h.status().details ?? []).join(' ');
    expect(named).toContain('Padded');
    expect(named).toContain('Missing');
    expect(named).not.toContain('Docs');
  });

  test('a shipped stamp on a page with no category follows the site\'s default category', async () => {
    const h = await harness([page('Missing', 'u2', { access: { edit: ['admin'] } })], ['u2'], 'documentation');
    expect(await h.manager.reportLegacyAccessLimits()).toBe(0);
  });

  test('a page whose check fails is skipped on save: the save still goes through', async () => {
    const h = await harness([]);
    (h.manager as unknown as { isShippedPageCopy: () => Promise<boolean> }).isShippedPageCopy = async () => { throw new Error('record unreadable'); };
    await expect(h.manager.savePage('Other', 'body', { title: 'Other', uuid: 'u9', 'system-category': 'general', access: { edit: ['alice'] } }, { username: 'jim' })).resolves.toBeDefined();
  });
});
