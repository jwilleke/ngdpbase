/**
 * #2466, decision of 2026-11-22: a private page's old `access:` limit is moved
 * to its Author Lock when its owner signs in. Start-up never touches a private
 * page (its own test in `PageManager.legacyAccessConvert.test.ts`); this pass
 * runs as the person who signed in, through their own permissions, and only
 * over the private pages whose author they are. Same exact-match rules as
 * start-up, a copy first, once per person, and never a reason to refuse a
 * sign-in.
 */
vi.unmock('../PageManager');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import { ALLOWING_PDP, ALLOWING_PIP, withWriteDoorAllowing } from '../../__tests__/__fixtures__/pageWriteDoor';

type Meta = Record<string, unknown>;
interface Info { title: string; uuid: string; filePath: string; metadata: Meta }
type Item = { state: string; kind?: string; reason?: string; details?: string[] };
interface Result { converted: number; left: number }
interface Subject { username: string; roles: string[]; isAuthenticated: boolean }
interface TestManager {
  provider: unknown;
  convertLegacyAccessAtBoot(): Promise<Result>;
  convertLegacyAccessOnSignIn(subject: Subject): Promise<Result>;
  reportLegacyAccessLimits(): Promise<number>;
  getAttentionItems(): Item[];
}

const ADMIN_RULE = { id: 'admin-full-access', effect: 'allow', subjects: [{ type: 'role', value: 'admin' }], actions: ['admin-system'] };
const ROOT_ID = 'urn:uuid:11111111-1111-4111-8111-111111111111';
const BOB_ID = 'urn:uuid:22222222-2222-4222-8222-222222222222';
const ROOT: Subject = { username: 'root', roles: ['admin'], isAuthenticated: true };
const BOB: Subject = { username: 'bob', roles: ['editor'], isAuthenticated: true };

describe('PageManager moves a private page\'s old access: limit when its owner signs in (#2466)', () => {
  let folder: string;
  let pages: Info[];
  let saved: Array<{ name: string; meta: Meta; as: unknown }>;
  let pip: Omit<typeof ALLOWING_PIP, 'canUserAccessPage'> & { canUserAccessPage: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-legacy-access-signin-2466-'));
    pages = [];
    saved = [];
    pip = { ...ALLOWING_PIP, canUserAccessPage: vi.fn(async () => true) };
  });
  afterEach(async () => {
    await fs.remove(folder);
  });

  const backupDir = (): string => path.join(folder, 'upgrade-backups');
  const backups = (): string[] => (fs.existsSync(backupDir()) && fs.statSync(backupDir()).isDirectory() ? fs.readdirSync(backupDir()) : []);

  async function add(title: string, metadata: Meta, body = 'body text'): Promise<Info> {
    const uuid = `u${pages.length + 1}`;
    const filePath = path.join(folder, `${uuid}.md`);
    await fs.writeFile(filePath, `---\ntitle: ${title}\nuuid: ${uuid}\n---\n${body}\n`);
    const info = { title, uuid, filePath, metadata: { title, uuid, 'system-category': 'general', ...metadata } };
    pages.push(info);
    return info;
  }

  function manager(): TestManager {
    const config = { getInstanceDataFolder: () => folder, getProperty: (_k: string, d: unknown) => d };
    const provider = {
      getAllPageInfo: vi.fn(async () => pages),
      getPage: vi.fn(async (name: string) => {
        const p = pages.find((i) => i.title === name);
        return p ? { name, title: name, uuid: p.uuid, metadata: { ...p.metadata }, content: 'body text' } : null;
      }),
      getPageMetadata: vi.fn(async (name: string) => pages.find((i) => i.title === name)?.metadata ?? null),
      savePage: vi.fn(async (name: string, _c: string, meta: Meta, as: unknown) => {
        saved.push({ name, meta, as });
        const p = pages.find((i) => i.title === name);
        if (p) p.metadata = { ...meta };
        return { name, uuid: String(meta.uuid) };
      })
    };
    const stand: Record<string, unknown> = {
      ConfigurationManager: config,
      PolicyInformationPoint: pip,
      PolicyDecisionPoint: { ...ALLOWING_PDP, policies: () => [ADMIN_RULE], permits: async (s: { roles?: string[] }, action: string) => action !== 'admin-system' || (s.roles ?? []).includes('admin') },
      IdentityManager: { usernameOf: async (_c: unknown, s: string) => (s === ROOT_ID ? 'root' : s === BOB_ID ? 'bob' : s), storedReferenceOf: async (_c: unknown, n: string) => n },
      UserManager: { getUser: async (u: string) => (u === 'root' ? { username: 'root', roles: ['admin'] } : u === 'bob' ? { username: 'bob', roles: ['editor'] } : undefined) }
    };
    const m = new PageManager({ getManager: vi.fn(withWriteDoorAllowing((name: string) => (stand[name] ?? null))) }) as unknown as TestManager;
    m.provider = provider;
    return m;
  }

  const metaOf = (title: string): Meta => pages.filter((p) => p.title === title)[0].metadata;
  const scans = (m: TestManager): number => (m.provider as { getAllPageInfo: { mock: { calls: unknown[] } } }).getAllPageInfo.mock.calls.length;
  const bannerText = (m: TestManager): string => m.getAttentionItems().flatMap((i) => [i.reason, ...(i.details ?? [])]).join('\n');

  test('the owner\'s private page with an exact match becomes an Author Lock, saved as the owner with a copy first', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
    const m = manager();
    await m.reportLegacyAccessLimits();
    expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
    expect(metaOf('Secret Plans').access).toBeUndefined();
    expect(metaOf('Secret Plans')['author-lock']).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0].as).toMatchObject({ username: 'root' });
    expect(backups()).toHaveLength(1);
  });

  test('it is decided by the owner\'s own permissions, never the system\'s', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
    const m = manager();
    await m.convertLegacyAccessOnSignIn(ROOT);
    const askedAs = pip.canUserAccessPage.mock.calls.map((c) => (c[0] as { username: string }).username);
    expect(askedAs).toContain('root');
    expect(askedAs).not.toContain('system');
  });

  test('a page the owner\'s permissions refuse is left as it is, with no copy kept, and the sign-in never throws', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
    pip.canUserAccessPage.mockResolvedValue(false);
    const m = manager();
    await m.reportLegacyAccessLimits();
    await expect(m.convertLegacyAccessOnSignIn(ROOT)).resolves.toEqual({ converted: 0, left: 1 });
    expect(saved).toEqual([]);
    expect(metaOf('Secret Plans').access).toEqual({ edit: ['admin'] });
    expect(backups()).toEqual([]);
  });

  test('only the signed-in person\'s own private pages: another person\'s and a page with no author are left', async () => {
    await add('Bobs Plans', { access: { edit: ['admin'] }, author: BOB_ID, private: true });
    await add('Nobodys Plans', { access: { edit: ['admin'] }, private: true });
    const m = manager();
    expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 0 });
    expect(saved).toEqual([]);
    expect(metaOf('Bobs Plans').access).toEqual({ edit: ['admin'] });
  });

  test('a page that is not private is not touched at sign-in: start-up owns it', async () => {
    await add('Board Notes', { access: { edit: ['admin'] }, author: ROOT_ID });
    const m = manager();
    expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 0 });
    expect(saved).toEqual([]);
  });

  test('start-up still never touches a private page', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
    const m = manager();
    expect(await m.convertLegacyAccessAtBoot()).toEqual({ converted: 0, left: 1 });
    expect(saved).toEqual([]);
  });

  test('the same exact-match rules: an edit list that is not exactly admin stays, and so does a view list', async () => {
    await add('Staff Plans', { access: { edit: ['editor'] }, author: ROOT_ID, private: true });
    await add('Reading Plans', { access: { view: ['admin'] }, author: ROOT_ID, private: true });
    await add('Both Plans', { access: { view: ['admin', 'editor'], edit: ['editor', 'admin'] }, author: ROOT_ID, private: true });
    const m = manager();
    expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 3 });
    expect(saved).toEqual([]);
    expect(backups()).toEqual([]);
  });

  test('a person who is not an administrator signs in: their own page converts only where the author is an administrator', async () => {
    await add('Bobs Plans', { access: { edit: ['admin'] }, author: BOB_ID, private: true });
    const m = manager();
    expect(await m.convertLegacyAccessOnSignIn(BOB)).toEqual({ converted: 0, left: 1 });
    expect(saved).toEqual([]);
  });

  test('it runs once per person: a second sign-in does not scan, even after a restart', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
    const m = manager();
    await m.convertLegacyAccessOnSignIn(ROOT);
    const after = scans(m);
    expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 0 });
    expect(scans(m)).toBe(after);
    const restarted = manager();
    expect(await restarted.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 0 });
    expect(scans(restarted)).toBe(0);
  });

  test('a page with no exact match is final: the person is not scanned again for it', async () => {
    await add('Staff Plans', { access: { edit: ['editor'] }, author: ROOT_ID, private: true });
    const m = manager();
    await m.convertLegacyAccessOnSignIn(ROOT);
    const after = scans(m);
    await m.convertLegacyAccessOnSignIn(ROOT);
    expect(scans(m)).toBe(after);
  });

  test('a failure is not recorded as done: the next sign-in tries again, and nothing throws', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
    const m = manager();
    const provider = m.provider as { savePage: ReturnType<typeof vi.fn> };
    const real = provider.savePage.getMockImplementation() as (...a: unknown[]) => Promise<unknown>;
    provider.savePage.mockRejectedValueOnce(new Error('disk full'));
    await expect(m.convertLegacyAccessOnSignIn(ROOT)).resolves.toEqual({ converted: 0, left: 1 });
    expect(backups()).toEqual([]);
    provider.savePage.mockImplementation(real);
    expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
  });

  test('two sign-ins at once convert the page once', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
    const m = manager();
    const [a, b] = await Promise.all([m.convertLegacyAccessOnSignIn(ROOT), m.convertLegacyAccessOnSignIn(ROOT)]);
    expect(a.converted + b.converted).toBe(1);
    expect(saved).toHaveLength(1);
    expect(backups()).toHaveLength(1);
  });

  test('a job of the system is refused: it never sweeps private pages', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
    const m = manager();
    expect(await m.convertLegacyAccessOnSignIn({ username: 'system', roles: ['admin'], isAuthenticated: true })).toEqual({ converted: 0, left: 0 });
    expect(saved).toEqual([]);
  });

  test('the banner\'s count of private pages left drops as owners sign in, and says what the update did without a title', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
    await add('Bobs Plans', { access: { edit: ['admin'] }, author: BOB_ID, private: true });
    const m = manager();
    await m.reportLegacyAccessLimits();
    expect(bannerText(m)).toMatch(/2 private pages/);
    await m.convertLegacyAccessOnSignIn(ROOT);
    const text = bannerText(m);
    expect(text).toMatch(/1 private page \(not named here\)/);
    expect(text).toMatch(/1 private page to its Author Lock/);
    expect(text).toMatch(/signed in/);
    expect(text).not.toContain('Secret Plans');
    expect(text).not.toContain('Bobs Plans');
    expect(text).not.toMatch(/#\d|docs\/|github|\.md\b|\blog\b|frontmatter|access:|urn:uuid|role/i);
  });

  test('the private page the pass converted is not named in the log', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
    const m = manager();
    const { default: logger } = await import('../../utils/logger');
    const lines: string[] = [];
    for (const level of ['info', 'warn', 'error'] as const) vi.spyOn(logger, level).mockImplementation(((...a: unknown[]) => { lines.push(a.join(' ')); return logger; }) as never);
    await m.convertLegacyAccessOnSignIn(ROOT);
    expect(lines.join('\n')).not.toContain('Secret Plans');
    vi.restoreAllMocks();
  });
});
