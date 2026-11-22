/**
 * #2466: at start, a page's old `access:` becomes its Audience or Author Lock
 * only when that lets in exactly the people the old limit did. Every other page
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
      PolicyDecisionPoint: { ...ALLOWING_PDP, policies: () => policies },
      IdentityManager: { usernameOf: async (_c: unknown, s: string) => (s === ADMIN_ID ? 'root' : s === BOB_ID ? 'bob' : s), storedReferenceOf: async (_c: unknown, n: string) => n },
      UserManager: { getUser: async (u: string) => (u === 'root' ? { username: 'root', roles: ['admin'] } : u === 'bob' ? { username: 'bob', roles: ['editor'] } : undefined) }
    };
    const m = new PageManager({ getManager: vi.fn(withWriteDoorAllowing((name: string) => (stand[name] ?? null))) }) as unknown as TestManager;
    m.provider = provider;
    return m;
  }

  const metaOf = (title: string): Meta => pages.filter((p) => p.title === title)[0].metadata;
  const bannerText = (m: TestManager): string => m.getAttentionItems().flatMap((i) => [i.reason, ...(i.details ?? [])]).join('\n');

  test('R2: edit limited to admin becomes an Author Lock; the same people for view and edit become an Audience', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    await add('Staff Pages', { access: { view: ['admin', 'editor'], edit: ['editor', 'admin'] } });
    const m = manager();
    const result = await m.convertLegacyAccessAtBoot();
    expect(result.converted).toBe(2);
    expect(metaOf('Board Notes').access).toBeUndefined();
    expect(metaOf('Board Notes')['author-lock']).toBe(true);
    expect(metaOf('Staff Pages').access).toBeUndefined();
    expect([...(metaOf('Staff Pages').audience as string[])].sort()).toEqual(['admin', 'editor']);
  });

  test('R3: a page with no exact replacement is not written and stays in the banner', async () => {
    await add('Read Limit', { access: { view: ['editor'] } });
    await add('Different Lists', { access: { view: ['admin', 'editor'], edit: ['admin'] } });
    await add('Bob Wrote It', { access: { edit: ['admin'] }, author: BOB_ID });
    await add('Delete Limit', { access: { delete: ['admin'] } });
    const m = manager();
    const result = await m.convertLegacyAccessAtBoot();
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
    expect((await m.convertLegacyAccessAtBoot()).converted).toBe(0);
    expect(saved).toEqual([]);
    expect(bannerText(m)).toContain('Board Notes');
  });

  test('R3: a page that already has an Audience of its own is not converted', async () => {
    await add('Has Audience', { access: { view: ['admin'], edit: ['admin'] }, audience: ['editor'] });
    const m = manager();
    expect((await m.convertLegacyAccessAtBoot()).converted).toBe(0);
    expect(saved).toEqual([]);
  });

  test('R6: a copy of the file as it was is written before the page is rewritten', async () => {
    const info = await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    const before = await fs.readFile(info.filePath, 'utf8');
    await manager().convertLegacyAccessAtBoot();
    expect(backups()).toHaveLength(1);
    expect(await fs.readFile(path.join(backupDir(), backups()[0]), 'utf8')).toBe(before);
  });

  test('R6: with no copy possible the page is left alone and stays in the banner', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    await fs.writeFile(backupDir(), 'not a folder');
    const m = manager();
    const result = await m.convertLegacyAccessAtBoot();
    expect(result.converted).toBe(0);
    expect(saved).toEqual([]);
    expect(metaOf('Board Notes').access).toEqual({ edit: ['admin'] });
    expect(bannerText(m)).toContain('Board Notes');
  });

  test('R6: nothing else about the page changes: body, author and other fields stay', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID, tags: ['x'], 'user-keywords': ['k'] });
    await manager().convertLegacyAccessAtBoot();
    const meta = metaOf('Board Notes');
    expect(meta.author).toBe(ADMIN_ID);
    expect(meta.tags).toEqual(['x']);
    expect(meta['user-keywords']).toEqual(['k']);
    expect(meta.title).toBe('Board Notes');
  });

  test('R5: a second start changes nothing and makes no copy', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    await add('Read Limit', { access: { view: ['editor'] } });
    await manager().convertLegacyAccessAtBoot();
    const copies = backups();
    const writes = saved.length;
    const again = manager();
    const result = await again.convertLegacyAccessAtBoot();
    expect(result.converted).toBe(0);
    expect(saved).toHaveLength(writes);
    expect(backups()).toEqual(copies);
    expect(bannerText(again)).not.toMatch(/Board Notes/);
  });

  test('R4: the banner says what changed in plain words, with a count and page names, and what was left', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ADMIN_ID });
    await add('Staff Pages', { access: { view: ['admin', 'editor'], edit: ['admin', 'editor'] } });
    await add('Read Limit', { access: { view: ['editor'] } });
    const m = manager();
    await m.convertLegacyAccessAtBoot();
    await m.reportLegacyAccessLimits();
    const [changed, left] = m.getAttentionItems();
    expect(changed.state).toBe('degraded');
    expect(changed.kind).toBe('attention');
    expect(changed.reason).toMatch(/^The update moved the old access limit on 2 pages to each page's Audience or Author Lock/);
    expect(changed.details).toEqual([
      'Board Notes: now has an Author Lock, so only its author and administrators can change it',
      'Staff Pages: now has an Audience of admin and editor'
    ]);
    expect(left.reason).toMatch(/^1 page has /);
    expect(left.details?.[0]).toContain('Read Limit');
    const text = bannerText(m);
    expect(text).not.toMatch(/#\d|docs\/|github|\.md\b|\blog\b|frontmatter|access:|urn:uuid/i);
  });

  test('a converted private page is counted but its title is not shown', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ADMIN_ID, private: true });
    const m = manager();
    expect((await m.convertLegacyAccessAtBoot()).converted).toBe(1);
    const text = JSON.stringify(m.getAttentionItems());
    expect(text).not.toContain('Secret Plans');
    expect(text).toMatch(/1 private page/);
  });

  test('a page in a vault is skipped', async () => {
    await add(formatPrivatePageName('alice', 'notes', 'Vault Page'), { access: { edit: ['admin'] }, author: ADMIN_ID });
    const m = manager();
    expect((await m.convertLegacyAccessAtBoot()).converted).toBe(0);
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
    const result = await m.convertLegacyAccessAtBoot();
    expect(result.converted).toBe(1);
    expect(metaOf('Broken').access).toEqual({ edit: ['admin'] });
    expect(metaOf('Board Notes').access).toBeUndefined();
  });
});
