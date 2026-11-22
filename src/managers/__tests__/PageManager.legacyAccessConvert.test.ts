/**
 * #2466: at start, a page's old `access:` becomes its Author Lock only when
 * that limits exactly the people the old limit did (an Audience would let a
 * listed person view past the site's access rules, so it is never made). Every other page
 * is left as it is and stays in the needs-attention list. Each rewrite is
 * preceded by a copy of the file, and a second start changes nothing.
 */
vi.unmock('../PageManager');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import { formatPrivatePageName } from '../../utils/privateStorePath';
import { ALLOWING_PDP, withWriteDoorAllowing } from '../../__tests__/__fixtures__/pageWriteDoor';

type Meta = Record<string, unknown>;
interface Info { title: string; uuid: string; filePath: string; metadata: Meta }
type Item = { state: string; kind?: string; reason?: string; details?: string[] };
interface ConvertResult { converted: number; left: number }
interface TestManager {
  provider: unknown;
  convertLegacyAccessAtBoot(): Promise<ConvertResult>;
  reportLegacyAccessLimits(): Promise<number>;
  getAttentionItems(): Item[];
}

const ADMIN_RULE = { id: 'admin-full-access', effect: 'allow', subjects: [{ type: 'role', value: 'admin' }], actions: ['admin-system'] };
const ADMIN_ID = 'urn:uuid:11111111-1111-4111-8111-111111111111';
const BOB_ID = 'urn:uuid:22222222-2222-4222-8222-222222222222';

describe('PageManager converts old access: limits that have an exact replacement (#2466)', () => {
  let folder: string;
  let pages: Info[];
  let saved: Array<{ name: string; meta: Meta }>;

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-legacy-access-2466-'));
    pages = [];
    saved = [];
  });
  afterEach(async () => {
    await fs.remove(folder);
  });

  const backupDir = (): string => path.join(folder, 'upgrade-backups');
  const backups = (): string[] => (fs.existsSync(backupDir()) && fs.statSync(backupDir()).isDirectory() ? fs.readdirSync(backupDir()) : []);

  /** A page whose file really exists, so its copy can be read. */
  async function add(title: string, metadata: Meta, body = 'body text'): Promise<Info> {
    const uuid = `u${pages.length + 1}`;
    const filePath = path.join(folder, `${uuid}.md`);
    await fs.writeFile(filePath, `---\ntitle: ${title}\nuuid: ${uuid}\n---\n${body}\n`);
    const info = { title, uuid, filePath, metadata: { title, uuid, 'system-category': 'general', ...metadata } };
    pages.push(info);
    return info;
  }

  function manager(policies: unknown[] = [ADMIN_RULE]): TestManager {
    const config = { getInstanceDataFolder: () => folder, getProperty: (_k: string, d: unknown) => d };
    const provider = {
      getAllPageInfo: vi.fn(async () => pages),
      getPage: vi.fn(async (name: string) => {
        const p = pages.find((i) => i.title === name);
        return p ? { name, title: name, uuid: p.uuid, metadata: { ...p.metadata }, content: 'body text' } : null;
      }),
      getPageMetadata: vi.fn(async (name: string) => pages.find((i) => i.title === name)?.metadata ?? null),
      savePage: vi.fn(async (name: string, _c: string, meta: Meta) => {
        saved.push({ name, meta });
        const p = pages.find((i) => i.title === name);
        if (p) p.metadata = { ...meta };
        return { name, uuid: String(meta.uuid) };
      })
    };
    const stand: Record<string, unknown> = {
      ConfigurationManager: config,
      // admin-system is held by the admin role, as the shipped policy gives it; every other action is allowed.
      PolicyDecisionPoint: { ...ALLOWING_PDP, policies: () => policies, permits: async (s: { roles?: string[] }, action: string) => action !== 'admin-system' || (s.roles ?? []).includes('admin') },
      IdentityManager: { usernameOf: async (_c: unknown, s: string) => (s === ADMIN_ID ? 'root' : s === BOB_ID ? 'bob' : s), storedReferenceOf: async (_c: unknown, n: string) => n },
      UserManager: { getUser: async (u: string) => (u === 'root' ? { username: 'root', roles: ['admin'] } : u === 'bob' ? { username: 'bob', roles: ['editor'] } : undefined) }
    };
    const m = new PageManager({ getManager: vi.fn(withWriteDoorAllowing((name: string) => (stand[name] ?? null))) }) as unknown as TestManager;
    m.provider = provider;
    return m;
  }

  /** Start-up as the engine runs it: convert, then list what is left. */
  const start = async (m: TestManager): Promise<ConvertResult> => {
    const result = await m.convertLegacyAccessAtBoot();
    await m.reportLegacyAccessLimits();
    return result;
  };
  const metaOf = (title: string): Meta => pages.filter((p) => p.title === title)[0].metadata;
  const bannerText = (m: TestManager): string => m.getAttentionItems().flatMap((i) => [i.reason, ...(i.details ?? [])]).join('\n');

  test('R2: edit limited to admin becomes an Author Lock, saved with its date and editor kept', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    const m = manager();
    const result = await start(m);
    expect(result.converted).toBe(1);
    expect(metaOf('Board Notes').access).toBeUndefined();
    expect(metaOf('Board Notes')['author-lock']).toBe(true);
    const provider = m.provider as { savePage: { mock: { calls: unknown[][] } } };
    expect(provider.savePage.mock.calls[0][4]).toMatchObject({ preserveLastModified: true, preserveEditor: true });
  });

  test('R3: view and edit naming the same people stay as they are: an Audience would let them view past the access rules', async () => {
    await add('Staff Pages', { access: { view: ['admin', 'editor'], edit: ['editor', 'admin'] } });
    const m = manager();
    expect(await start(m)).toEqual({ converted: 0, left: 1 });
    expect(saved).toEqual([]);
    expect(metaOf('Staff Pages').access).toBeDefined();
    expect(bannerText(m)).toContain('Staff Pages');
  });

  test('R6: a page that is not the one backed up is left alone', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    const m = manager();
    const provider = m.provider as { getPage: ReturnType<typeof vi.fn> };
    const real = provider.getPage.getMockImplementation() as (n: string) => Promise<Record<string, unknown> | null>;
    provider.getPage.mockImplementation(async (n: string) => ({ ...(await real(n)), uuid: 'someone-else' }));
    expect(await start(m)).toEqual({ converted: 0, left: 1 });
    expect(saved).toEqual([]);
    expect(backups()).toEqual([]);
  });

  test('R6: a file that changed between the copy and the save is left alone', async () => {
    const info = await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    const m = manager();
    const provider = m.provider as { getPage: ReturnType<typeof vi.fn> };
    const real = provider.getPage.getMockImplementation() as (n: string) => Promise<Record<string, unknown> | null>;
    provider.getPage.mockImplementation(async (n: string) => {
      await fs.appendFile(info.filePath, 'someone edited this\n');
      return real(n);
    });
    expect(await start(m)).toEqual({ converted: 0, left: 1 });
    expect(saved).toEqual([]);
  });

  test('R3: a page with no exact replacement is not written and stays in the banner', async () => {
    await add('Read Limit', { access: { view: ['editor'] } });
    await add('Different Lists', { access: { view: ['admin', 'editor'], edit: ['admin'] } });
    await add('Bob Wrote It', { access: { edit: ['admin'] }, author: BOB_ID });
    await add('Delete Limit', { access: { delete: ['admin'] } });
    const m = manager();
    const result = await start(m);
    expect(result).toEqual({ converted: 0, left: 4 });
    expect(saved).toEqual([]);
    expect(backups()).toEqual([]);
    for (const t of ['Read Limit', 'Different Lists', 'Bob Wrote It', 'Delete Limit']) {
      expect(metaOf(t).access).toBeDefined();
      expect(bannerText(m)).toContain(t);
    }
  });

  test('R3: where administrators are not provably the admin role, nothing is converted', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    const other = { id: 'ops-admin', effect: 'allow', subjects: [{ type: 'user', value: 'ops' }], actions: ['admin-system'] };
    const m = manager([ADMIN_RULE, other]);
    expect((await start(m)).converted).toBe(0);
    expect(saved).toEqual([]);
    expect(bannerText(m)).toContain('Board Notes');
  });

  test('R3: a page that already has an Audience of its own is not converted', async () => {
    await add('Has Audience', { access: { view: ['admin'], edit: ['admin'] }, audience: ['editor'] });
    const m = manager();
    expect((await start(m)).converted).toBe(0);
    expect(saved).toEqual([]);
  });

  test('R6: a copy of the file as it was is written before the page is rewritten', async () => {
    const info = await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    const before = await fs.readFile(info.filePath, 'utf8');
    await start(manager());
    expect(backups()).toHaveLength(1);
    expect(await fs.readFile(path.join(backupDir(), backups()[0]), 'utf8')).toBe(before);
  });

  test('R6: with no copy possible the page is left alone and stays in the banner', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    await fs.writeFile(backupDir(), 'not a folder');
    const m = manager();
    const result = await start(m);
    expect(result.converted).toBe(0);
    expect(saved).toEqual([]);
    expect(metaOf('Board Notes').access).toEqual({ edit: ['admin'] });
    expect(bannerText(m)).toContain('Board Notes');
  });

  test('R6: nothing else about the page changes: body, author and other fields stay', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID, tags: ['x'], 'user-keywords': ['k'] });
    await start(manager());
    const meta = metaOf('Board Notes');
    expect(meta.author).toBe(ADMIN_ID);
    expect(meta.tags).toEqual(['x']);
    expect(meta['user-keywords']).toEqual(['k']);
    expect(meta.title).toBe('Board Notes');
  });

  test('R5: a second start changes nothing and makes no copy', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    await add('Read Limit', { access: { view: ['editor'] } });
    await start(manager());
    const copies = backups();
    const writes = saved.length;
    const again = manager();
    const result = await start(again);
    expect(result.converted).toBe(0);
    expect(saved).toHaveLength(writes);
    expect(backups()).toEqual(copies);
    expect(bannerText(again)).not.toMatch(/Board Notes/);
  });

  test('R4: the banner says what changed in plain words, with a count and page names, and what was left', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    await add('Team Plan', { access: { edit: ['admin'] } });
    await add('Read Limit', { access: { view: ['editor'] } });
    const m = manager();
    await start(m);
    const [changed, left] = m.getAttentionItems();
    expect(changed.state).toBe('degraded');
    expect(changed.kind).toBe('attention');
    expect(changed.reason).toMatch(/^The update moved the old access limit on 2 pages to their Author Lock/);
    expect(changed.details).toEqual([
      'Board Notes: now has an Author Lock, so only its author and administrators can change it',
      'Team Plan: now has an Author Lock, so only its author and administrators can change it'
    ]);
    expect(left.reason).toMatch(/^1 page has /);
    expect(left.details?.[0]).toContain('Read Limit');
    const text = bannerText(m);
    expect(text).not.toMatch(/#\d|docs\/|github|\.md\b|\blog\b|frontmatter|access:|urn:uuid/i);
  });

  test('R4: one converted page reads in the singular', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    const m = manager();
    await start(m);
    expect(m.getAttentionItems()[0].reason).toMatch(/^The update moved the old access limit on 1 page to its Author Lock\. Nothing else on it changed\.$/);
  });

  test('a private page is left for its owner: not written, counted in the banner without its title', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ADMIN_ID, private: true });
    const m = manager();
    expect(await start(m)).toEqual({ converted: 0, left: 1 });
    expect(saved).toEqual([]);
    expect(JSON.stringify(m.getAttentionItems())).not.toContain('Secret Plans');
    expect(JSON.stringify(m.getAttentionItems())).toMatch(/1 private page/);
  });

  test('a page in a vault is skipped', async () => {
    await add(formatPrivatePageName('alice', 'notes', 'Vault Page'), { access: { edit: ['admin'] }, author: ADMIN_ID });
    const m = manager();
    expect((await start(m)).converted).toBe(0);
    expect(saved).toEqual([]);
  });

  test('a failure on one page does not stop the rest, and never throws', async () => {
    await add('Broken', { access: { edit: ['admin'] }, author: ADMIN_ID });
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    const m = manager();
    const provider = m.provider as { savePage: ReturnType<typeof vi.fn> };
    const real = provider.savePage.getMockImplementation() as (...a: unknown[]) => Promise<unknown>;
    provider.savePage.mockImplementation(async (name: string, ...rest: unknown[]) => {
      if (name === 'Broken') throw new Error('disk full');
      return real(name, ...rest);
    });
    const result = await start(m);
    expect(result.converted).toBe(1);
    expect(metaOf('Broken').access).toEqual({ edit: ['admin'] });
    expect(metaOf('Board Notes').access).toBeUndefined();
  });
});
