/**
 * #2509: the upgrade clean-up of old `access:` limits (#2466) with user records
 * as the store really holds them, and with pages kept in a vault.
 *
 * 1. A real user record has no `roles` field, so "is the author an
 *    administrator" must be asked of the site's permission check, never read
 *    from the record. Nothing here mocks `authorHoldsAdmin`, and no record
 *    carries `roles`; the permission check answers from the roles held in the
 *    role store, looked up by name, as the real one does for a subject that
 *    carries none.
 * 2. A private page in a vault (`vaults/{owner}/{store}/{title}`) is reached by
 *    the start-up, sign-in and banner passes: start-up counts it for its
 *    owner, the owner's sign-in converts it (with a copy first), and the banner
 *    count drops to match.
 */
vi.unmock('../PageManager');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import logger from '../../utils/logger';
import { formatPrivatePageName, parsePrivatePageName } from '../../utils/privateStorePath';
import { SealedVaultRefusedError } from '../../utils/privateStoreMeta';
import { ALLOWING_PDP, withWriteDoorAllowing } from '../../__tests__/__fixtures__/pageWriteDoor';

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

/** Who holds which role, as the role store has it: nothing of this is on the user records. */
const ROLES: Record<string, string[]> = { root: ['admin'], bob: ['editor'] };
/** The user records as they are stored: no `roles` field. */
const RECORDS: Record<string, Meta> = {
  root: { username: 'root', isActive: true },
  bob: { username: 'bob', isActive: true }
};

describe('the upgrade clean-up with real user records and vault pages (#2509)', () => {
  let folder: string;
  let pages: Info[];
  let saved: Array<{ name: string; meta: Meta; as: unknown }>;
  /** What the provider answers when a page is read back: the page, nothing (a sealed vault), or a thrown error. */
  let readBack: 'page' | 'nothing' | Error;
  /** Set to make the provider's save fail. */
  let saveFails: Error | null;

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-legacy-access-2509-'));
    pages = [];
    saved = [];
    readBack = 'page';
    saveFails = null;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(folder);
  });

  const backupDir = (): string => path.join(folder, 'upgrade-backups');
  const backups = (): string[] => (fs.existsSync(backupDir()) && fs.statSync(backupDir()).isDirectory() ? fs.readdirSync(backupDir()) : []);

  async function add(title: string, metadata: Meta): Promise<Info> {
    const uuid = `u${pages.length + 1}`;
    const filePath = path.join(folder, `${uuid}.md`);
    // A vault page is listed by its path, and its own title is the last part of it.
    const own = parsePrivatePageName(title)?.title ?? title;
    await fs.writeFile(filePath, `---\ntitle: ${own}\nuuid: ${uuid}\n---\nbody text\n`);
    const info = { title, uuid, filePath, metadata: { title: own, uuid, 'system-category': 'general', ...metadata } };
    pages.push(info);
    return info;
  }

  function manager(over: Record<string, unknown> = {}): TestManager {
    const config = { getInstanceDataFolder: () => folder, getProperty: (_k: string, d: unknown) => d };
    const provider = {
      getAllPageInfo: vi.fn(async () => pages.map((p) => ({ ...p }))),
      getPage: vi.fn(async (name: string) => {
        if (readBack instanceof Error) throw readBack;
        if (readBack === 'nothing') return null;
        const p = pages.find((i) => i.title === name);
        return p ? { name, title: name, uuid: p.uuid, metadata: { ...p.metadata }, content: 'body text' } : null;
      }),
      getPageMetadata: vi.fn(async (name: string) => pages.find((i) => i.title === name)?.metadata ?? null),
      savePage: vi.fn(async (name: string, _c: string, meta: Meta, as: unknown) => {
        if (saveFails) throw saveFails;
        saved.push({ name, meta, as });
        const p = pages.find((i) => i.title === name);
        if (p) p.metadata = { ...meta };
        return { name, uuid: String(meta.uuid) };
      })
    };
    const stand: Record<string, unknown> = {
      ConfigurationManager: config,
      // Like the real one: a subject that carries roles is taken as given; one that carries none has its roles looked up now, by name.
      PolicyDecisionPoint: {
        ...ALLOWING_PDP,
        policies: () => [ADMIN_RULE],
        permits: async (s: { username: string; roles?: string[] }, action: string) => {
          const roles = Array.isArray(s.roles) ? s.roles : (ROLES[s.username] ?? []);
          return action !== 'admin-system' || roles.includes('admin');
        }
      },
      IdentityManager: { usernameOf: async (_c: unknown, s: string) => (s === ROOT_ID ? 'root' : s === BOB_ID ? 'bob' : s), storedReferenceOf: async (_c: unknown, n: string) => n },
      UserManager: { getUser: async (u: string) => RECORDS[u] },
      ...over
    };
    const m = new PageManager({ getManager: vi.fn(withWriteDoorAllowing((name: string) => (stand[name] ?? null))) }) as unknown as TestManager;
    m.provider = provider;
    return m;
  }

  const metaOf = (title: string): Meta => pages.filter((p) => p.title === title)[0].metadata;
  const bannerText = (m: TestManager): string => m.getAttentionItems().flatMap((i) => [i.reason, ...(i.details ?? [])]).join('\n');
  function captureLog(): () => string {
    const lines: string[] = [];
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      vi.spyOn(logger, level).mockImplementation(((...a: unknown[]) => { lines.push(a.map(String).join(' ')); return logger; }) as never);
    }
    return () => lines.join('\n');
  }

  const VAULT_ROOT = formatPrivatePageName('root', 'notes', 'Secret Plans');
  const VAULT_BOB = formatPrivatePageName('bob', 'notes', 'Bobs Plans');

  describe('1. the author is judged by the permission check, not a stored roles field', () => {
    test('start-up: a public page with edit: [admin] by an administrator whose record has no roles gets an Author Lock', async () => {
      await add('Board Notes', { access: { edit: ['admin'] }, author: ROOT_ID });
      const m = manager();
      expect(await m.convertLegacyAccessAtBoot()).toEqual({ converted: 1, left: 0 });
      expect(metaOf('Board Notes').access).toBeUndefined();
      expect(metaOf('Board Notes')['author-lock']).toBe(true);
      expect(backups()).toHaveLength(1);
    });

    test('start-up: an author who does not hold the admin permission is still final', async () => {
      await add('Bobs Notes', { access: { edit: ['admin'] }, author: BOB_ID });
      const m = manager();
      expect(await m.convertLegacyAccessAtBoot()).toEqual({ converted: 0, left: 1 });
      expect(saved).toEqual([]);
    });

    test('start-up: an author who is not a known account is not an administrator', async () => {
      await add('Ghost Notes', { access: { edit: ['admin'] }, author: 'ghost' });
      const m = manager();
      expect(await m.convertLegacyAccessAtBoot()).toEqual({ converted: 0, left: 1 });
    });

    test('sign-in: an administrator-owned bare-title private page converts, and the banner count drops', async () => {
      await add('Secret Notes', { access: { edit: ['admin'] }, author: ROOT_ID, private: true });
      const m = manager();
      await m.reportLegacyAccessLimits();
      expect(bannerText(m)).toMatch(/1 private page/);
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
      expect(metaOf('Secret Notes')['author-lock']).toBe(true);
      expect(bannerText(m)).not.toMatch(/\(not named here\)/);
    });
  });

  describe('2. a private page in a vault is reached by every pass', () => {
    test('start-up counts the vault page as left for its owner, writes nothing, and the banner lists it as private', async () => {
      await add(VAULT_ROOT, { access: { edit: ['admin'] }, author: ROOT_ID });
      const m = manager();
      expect(await m.convertLegacyAccessAtBoot()).toEqual({ converted: 0, left: 1 });
      expect(saved).toEqual([]);
      await m.reportLegacyAccessLimits();
      const text = bannerText(m);
      expect(text).toMatch(/1 private page \(not named here\)/);
      expect(text).not.toContain('Secret Plans');
    });

    test('the owner signs in: the vault page gets an Author Lock, saved as the owner, with a copy in upgrade-backups', async () => {
      await add(VAULT_ROOT, { access: { edit: ['admin'] }, author: ROOT_ID });
      const m = manager();
      await m.reportLegacyAccessLimits();
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
      expect(metaOf(VAULT_ROOT).access).toBeUndefined();
      expect(metaOf(VAULT_ROOT)['author-lock']).toBe(true);
      expect(saved).toHaveLength(1);
      expect(saved[0].as).toMatchObject({ username: 'root' });
      expect(backups()).toHaveLength(1);
    });

    test('the banner counts the vault page before the sign-in and says what the update did after it, without a title', async () => {
      await add(VAULT_ROOT, { access: { edit: ['admin'] }, author: ROOT_ID });
      await add(VAULT_BOB, { access: { edit: ['admin'] }, author: BOB_ID });
      const m = manager();
      await m.reportLegacyAccessLimits();
      expect(bannerText(m)).toMatch(/2 private pages/);
      await m.convertLegacyAccessOnSignIn(ROOT);
      const text = bannerText(m);
      expect(text).toMatch(/1 private page \(not named here\)/);
      expect(text).toMatch(/1 private page to its Author Lock/);
      expect(text).not.toContain('Secret Plans');
      expect(text).not.toContain('Bobs Plans');
    });

    test('only the signed-in person\'s own vault: another person\'s vault page is left as it is', async () => {
      await add(VAULT_BOB, { access: { edit: ['admin'] }, author: BOB_ID });
      const m = manager();
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 0 });
      expect(saved).toEqual([]);
      expect(metaOf(VAULT_BOB).access).toEqual({ edit: ['admin'] });
    });

    test('a vault page whose limit has no exact replacement is left, and counted as left', async () => {
      await add(VAULT_ROOT, { access: { edit: ['editor'] }, author: ROOT_ID });
      const m = manager();
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 1 });
      expect(saved).toEqual([]);
      expect(backups()).toEqual([]);
    });

    test('a shared folder page is nobody\'s vault: it is left out of every pass', async () => {
      await add('shared/team-docs/Handbook', { access: { edit: ['admin'] }, author: ROOT_ID });
      const m = manager();
      expect(await m.convertLegacyAccessAtBoot()).toEqual({ converted: 0, left: 0 });
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 0 });
      await m.reportLegacyAccessLimits();
      expect(m.getAttentionItems()).toEqual([]);
      expect(saved).toEqual([]);
    });

    test('a vault page is never named in the log', async () => {
      await add(VAULT_ROOT, { access: { edit: ['admin'] }, author: ROOT_ID });
      const m = manager();
      const log = captureLog();
      await m.convertLegacyAccessAtBoot();
      await m.reportLegacyAccessLimits();
      await m.convertLegacyAccessOnSignIn(ROOT);
      expect(log()).not.toContain('Secret Plans');
      expect(log()).not.toContain(VAULT_ROOT);
    });

    test('a vault page\'s owner and store are not named in the log either, when it is moved or when it fails', async () => {
      await add(VAULT_ROOT, { access: { edit: ['admin'] }, author: ROOT_ID });
      const m = manager();
      const log = captureLog();
      saveFails = new Error(`refused: ${VAULT_ROOT}`);
      await m.convertLegacyAccessOnSignIn(ROOT);
      saveFails = null;
      await m.convertLegacyAccessOnSignIn(ROOT);
      expect(metaOf(VAULT_ROOT)['author-lock']).toBe(true);
      const text = log();
      // Both lines were written: the failure and the move.
      expect(text).toMatch(/could not be moved/);
      expect(text).toMatch(/Moved the old access limit/);
      expect(text).not.toContain("root's");
      expect(text).not.toContain("'notes'");
      expect(text).not.toMatch(/store/i);
      expect(text).not.toContain('Secret Plans');
    });

    // M1: a vault page's owner comes from its path, so the page's author must be that owner.
    describe('the author of a vault page must be its owner (a Lock by someone else would lock the owner out)', () => {
      test('no author: not converted, counted as left', async () => {
        await add(VAULT_BOB, { access: { edit: ['admin'] } });
        const m = manager();
        expect(await m.convertLegacyAccessOnSignIn(BOB)).toEqual({ converted: 0, left: 1 });
        expect(saved).toEqual([]);
        expect(metaOf(VAULT_BOB).access).toEqual({ edit: ['admin'] });
        expect(backups()).toEqual([]);
      });

      test('an administrator as author: not converted, counted as left', async () => {
        await add(VAULT_BOB, { access: { edit: ['admin'] }, author: ROOT_ID });
        const m = manager();
        expect(await m.convertLegacyAccessOnSignIn(BOB)).toEqual({ converted: 0, left: 1 });
        expect(saved).toEqual([]);
        expect(metaOf(VAULT_BOB)['author-lock']).toBeUndefined();
      });

      test('the owner as author, who is not an administrator: converted, saved as the owner', async () => {
        await add(VAULT_BOB, { access: { edit: ['admin'] }, author: BOB_ID });
        const m = manager();
        expect(await m.convertLegacyAccessOnSignIn(BOB)).toEqual({ converted: 1, left: 0 });
        expect(metaOf(VAULT_BOB)['author-lock']).toBe(true);
        expect(metaOf(VAULT_BOB).access).toBeUndefined();
        expect(saved[0].as).toMatchObject({ username: 'bob' });
      });

      test('the author cannot be looked up now: left and tried again at the next sign-in', async () => {
        await add(VAULT_BOB, { access: { edit: ['admin'] }, author: BOB_ID });
        let down = true;
        const m = manager({
          IdentityManager: {
            usernameOf: async (_c: unknown, s: string) => { if (down) throw new Error('identity store down'); return s === BOB_ID ? 'bob' : s; },
            storedReferenceOf: async (_c: unknown, n: string) => n
          }
        });
        expect(await m.convertLegacyAccessOnSignIn(BOB)).toEqual({ converted: 0, left: 1 });
        expect(saved).toEqual([]);
        down = false;
        expect(await m.convertLegacyAccessOnSignIn(BOB)).toEqual({ converted: 1, left: 0 });
      });
    });

    // L4: a vault whose files are sealed cannot be read without its key.
    describe('an encrypted vault at sign-in', () => {
      const bytesOf = (info: Info): string => fs.readFileSync(info.filePath, 'utf8');

      test('the vault will not give the page back (closed): nothing is copied or written, and the owner is tried again at the next sign-in', async () => {
        const info = await add(VAULT_ROOT, { access: { edit: ['admin'] }, author: ROOT_ID });
        const before = bytesOf(info);
        const m = manager();
        readBack = 'nothing';
        expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 1 });
        expect(saved).toEqual([]);
        expect(backups()).toEqual([]);
        expect(bytesOf(info)).toBe(before);
        // Not final: once the vault can be read, the next sign-in converts it.
        readBack = 'page';
        expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
      });

      test('the vault refuses the read with an error: no throw, nothing copied or written, tried again later', async () => {
        const info = await add(VAULT_ROOT, { access: { edit: ['admin'] }, author: ROOT_ID });
        const before = bytesOf(info);
        const m = manager();
        const log = captureLog();
        readBack = new SealedVaultRefusedError('root', 'notes', 'unopened');
        await expect(m.convertLegacyAccessOnSignIn(ROOT)).resolves.toEqual({ converted: 0, left: 1 });
        expect(saved).toEqual([]);
        expect(backups()).toEqual([]);
        expect(bytesOf(info)).toBe(before);
        expect(log()).not.toContain('Secret Plans');
        expect(log()).not.toContain('open it at');
        readBack = 'page';
        expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
      });
    });
  });
});
