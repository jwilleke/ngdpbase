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
import PageManager, { PageAudienceRefusedError } from '../PageManager';
import logger from '../../utils/logger';
import { ALLOWING_PDP, ALLOWING_PIP, withWriteDoorAllowing } from '../../__tests__/__fixtures__/pageWriteDoor';

type Meta = Record<string, unknown>;
interface Info { title: string; uuid: string; filePath: string; metadata: Meta }
type Item = { state: string; kind?: string; reason?: string; details?: string[] };
interface Result { converted: number; left: number }
interface Subject { username: string; roles: string[]; isAuthenticated: boolean; [key: string]: unknown }
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
const ANN_ID = 'urn:uuid:33333333-3333-4333-8333-333333333333';
const ROOT: Subject = { username: 'root', roles: ['admin'], isAuthenticated: true };
const BOB: Subject = { username: 'bob', roles: ['editor'], isAuthenticated: true };
const ANN: Subject = { username: 'ann', roles: ['admin'], isAuthenticated: true };

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

  function manager(over: Record<string, unknown> = {}): TestManager {
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
      IdentityManager: { usernameOf: async (_c: unknown, s: string) => (s === ROOT_ID ? 'root' : s === BOB_ID ? 'bob' : s === ANN_ID ? 'ann' : s), storedReferenceOf: async (_c: unknown, n: string) => n },
      UserManager: { getUser: async (u: string) => (u === 'root' ? { username: 'root', roles: ['admin'] } : u === 'ann' ? { username: 'ann', roles: ['admin'] } : u === 'bob' ? { username: 'bob', roles: ['editor'] } : undefined) },
      ...over
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

  /** Every line the logger is given while a test runs. */
  function captureLog(): () => string {
    const lines: string[] = [];
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      vi.spyOn(logger, level).mockImplementation(((...a: unknown[]) => { lines.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ')); return logger; }) as never);
    }
    return () => lines.join('\n');
  }
  const doneFile = (): string => path.join(folder, 'upgrade-signin-done.json');
  const doneUsers = (): string[] => (JSON.parse(fs.readFileSync(doneFile(), 'utf8')) as { users: string[] }).users;

  describe('a lookup that fails is not a "no" (#2466)', () => {
    test('the user store throws once: the page is not recorded as final, and the next sign-in converts it', async () => {
      await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      let down = true;
      const m = manager({
        UserManager: { getUser: async (u: string) => { if (down) throw new Error('user store unavailable'); return u === 'root' ? { username: 'root', roles: ['admin'] } : undefined; } }
      });
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 1 });
      expect(fs.existsSync(doneFile())).toBe(false);
      expect(saved).toEqual([]);
      down = false;
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
      expect(metaOf('Secret Plans')['author-lock']).toBe(true);
      expect(doneUsers()).toContain('root');
    });

    test('the access rules are not loaded yet: the page is tried again at the next sign-in', async () => {
      await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      let rules: unknown[] = [];
      const m = manager({
        PolicyDecisionPoint: { ...ALLOWING_PDP, policies: () => rules, permits: async (s: { roles?: string[] }, action: string) => action !== 'admin-system' || (s.roles ?? []).includes('admin') }
      });
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 1 });
      expect(fs.existsSync(doneFile())).toBe(false);
      rules = [ADMIN_RULE];
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
    });

    test('an author who is truly not an administrator is still final', async () => {
      await add('Bobs Plans', { access: { edit: ['admin'] }, author: BOB_ID, private: true });
      const m = manager();
      await m.convertLegacyAccessOnSignIn(BOB);
      expect(doneUsers()).toContain('bob');
    });
  });

  describe('a private page\'s title stays out of the log (#2466)', () => {
    afterEach(() => vi.restoreAllMocks());

    test('a save refused for the page\'s audience: the log names the error class and the page by its uuid', async () => {
      await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      const m = manager();
      const log = captureLog();
      (m.provider as { savePage: ReturnType<typeof vi.fn> }).savePage.mockRejectedValueOnce(new PageAudienceRefusedError('Secret Plans'));
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 1 });
      expect(log()).toMatch(/PageAudienceRefusedError/);
      expect(log()).not.toContain('Secret Plans');
    });

    test('a save that reports an error after the file was rewritten: the log does not carry the title', async () => {
      const info = await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      const m = manager();
      const log = captureLog();
      (m.provider as { savePage: ReturnType<typeof vi.fn> }).savePage.mockImplementationOnce(async () => {
        await fs.writeFile(info.filePath, '---\ntitle: Secret Plans\nauthor-lock: true\n---\nbody\n');
        throw new PageAudienceRefusedError('Secret Plans');
      });
      await m.convertLegacyAccessOnSignIn(ROOT);
      expect(log()).toMatch(/PageAudienceRefusedError/);
      expect(log()).not.toContain('Secret Plans');
    });

    test('a failure that reaches the outer catch does not carry the title either', async () => {
      await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      const m = manager();
      const log = captureLog();
      (m.provider as { getAllPageInfo: ReturnType<typeof vi.fn> }).getAllPageInfo.mockRejectedValueOnce(new Error("cannot list 'Secret Plans'"));
      await m.convertLegacyAccessOnSignIn(ROOT);
      expect(log()).not.toContain('Secret Plans');
    });

    test('a page that is converted, left, or refused leaves no title in any line', async () => {
      await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      await add('Staff Plans', { access: { edit: ['editor'] }, author: ROOT_ID, private: true });
      const m = manager();
      const log = captureLog();
      await m.convertLegacyAccessOnSignIn(ROOT);
      expect(log()).not.toMatch(/Secret Plans|Staff Plans/);
    });
  });

  describe('who may start the pass (#2466)', () => {
    const refused = (extra: Record<string, unknown>): Subject => ({ ...ROOT, ...extra });
    const cases: Array<[string, Subject]> = [
      ['a token', refused({ viaToken: { kind: 'token', id: 't1' } })],
      ['a share', refused({ viaShare: { kind: 'share', id: 's1' } })],
      ['a proxy', refused({ viaProxy: { kind: 'proxy', grantId: 'g1', actor: 'ann', scopes: [] } })],
      ['a system job', refused({ origin: 'scheduler', requestedAt: '2026-11-23T10:00:00.000Z' })],
      ['a caller who is not signed in', refused({ isAuthenticated: false })],
      ['the system principal', { username: 'system', roles: ['admin'], isAuthenticated: true }]
    ];
    test.each(cases)('%s is refused: nothing is scanned, saved or copied', async (_name, subject) => {
      await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      const m = manager();
      expect(await m.convertLegacyAccessOnSignIn(subject)).toEqual({ converted: 0, left: 0 });
      expect(scans(m)).toBe(0);
      expect(saved).toEqual([]);
      expect(backups()).toEqual([]);
      expect(fs.existsSync(doneFile())).toBe(false);
    });
  });

  describe('a page that changes while the pass runs (#2466)', () => {
    test('its file changes after it was listed: nothing is written over it, no copy is kept, and the next sign-in converts it', async () => {
      const info = await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      const m = manager();
      const provider = m.provider as { getPage: ReturnType<typeof vi.fn> };
      const real = provider.getPage.getMockImplementation() as (...a: unknown[]) => Promise<unknown>;
      provider.getPage.mockImplementationOnce(async (...a: unknown[]) => {
        await fs.appendFile(info.filePath, 'a line written meanwhile\n');
        return real(...a);
      });
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 1 });
      expect(saved).toEqual([]);
      expect(backups()).toEqual([]);
      expect(fs.existsSync(doneFile())).toBe(false);
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
    });

    test('its limit changes so it no longer matches: it is left, and tried again at the next sign-in', async () => {
      await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      const m = manager();
      const provider = m.provider as { getPage: ReturnType<typeof vi.fn> };
      const real = provider.getPage.getMockImplementation() as (...a: unknown[]) => Promise<{ metadata: Meta }>;
      provider.getPage.mockImplementationOnce(async (...a: unknown[]) => {
        const page = await real(...a);
        return { ...page, metadata: { ...page.metadata, access: { edit: ['admin', 'editor'] } } };
      });
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 1 });
      expect(saved).toEqual([]);
      expect(fs.existsSync(doneFile())).toBe(false);
    });

    test('the page read is not the page listed: it is left alone', async () => {
      await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      const m = manager();
      const provider = m.provider as { getPage: ReturnType<typeof vi.fn> };
      const real = provider.getPage.getMockImplementation() as (...a: unknown[]) => Promise<Record<string, unknown>>;
      provider.getPage.mockImplementationOnce(async (...a: unknown[]) => ({ ...(await real(...a)), uuid: 'someone-elses' }));
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 1 });
      expect(saved).toEqual([]);
      expect(backups()).toEqual([]);
    });
  });

  test('two different people sign in together: each converts their own page, and both are recorded', async () => {
    await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
    await add('Annes Plans', { access: { edit: ['admin'] }, author: ANN_ID, private: true });
    const m = manager();
    const [a, b] = await Promise.all([m.convertLegacyAccessOnSignIn(ROOT), m.convertLegacyAccessOnSignIn(ANN)]);
    expect(a).toEqual({ converted: 1, left: 0 });
    expect(b).toEqual({ converted: 1, left: 0 });
    expect(saved.map((s) => (s.as as { username: string }).username).sort()).toEqual(['ann', 'root']);
    expect(backups()).toHaveLength(2);
    expect(doneUsers()).toEqual(['ann', 'root']);
    expect(fs.readdirSync(folder).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  describe('the record of who is done (#2466)', () => {
    afterEach(() => vi.restoreAllMocks());

    test('a record that cannot be read is logged and kept as it is: other people are not dropped from it', async () => {
      await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      const damaged = '{"users": ["ann", "bob"';
      await fs.writeFile(doneFile(), damaged);
      const m = manager();
      const log = captureLog();
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
      expect(fs.readFileSync(doneFile(), 'utf8')).toBe(damaged);
      expect(log()).toMatch(/upgrade-signin-done\.json|record of who/i);
    });

    test('a readable record keeps the other people when one more is added', async () => {
      await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      await fs.writeFile(doneFile(), JSON.stringify({ users: ['ann'] }));
      const m = manager();
      await m.convertLegacyAccessOnSignIn(ROOT);
      expect(doneUsers()).toEqual(['ann', 'root']);
    });

    test('a missing record is not a failure: it is made, with no warning about it', async () => {
      await add('Secret Plans', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      const m = manager();
      const log = captureLog();
      await m.convertLegacyAccessOnSignIn(ROOT);
      expect(doneUsers()).toEqual(['root']);
      expect(log()).not.toMatch(/upgrade-signin-done|record of who/i);
    });
  });
});
