/**
 * #2514: the upgrade clean-up of old `access:` limits (#2466, #2509) on a
 * vault page that is really on disk, read through the real
 * `FileSystemProvider`.
 *
 * `getAllPageInfo()` of the real provider leaves the vaults folder out, so a
 * pass that lists pages only with it never meets a vault page. The tests in
 * `PageManager.legacyAccessRealUsers.test.ts` feed vault pages through a mock
 * that lists them there, which the real provider does not; these do not.
 */
vi.unmock('../PageManager');
vi.unmock('../../providers/FileSystemProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import FileSystemProvider from '../../providers/FileSystemProvider';
import ValidationManager from '../ValidationManager';
import { ALLOWING_PDP, withWriteDoorAllowing } from '../../__tests__/__fixtures__/pageWriteDoor';

type Meta = Record<string, unknown>;
interface Subject { username: string; roles: string[]; isAuthenticated: boolean }
interface TestManager {
  provider: unknown;
  convertLegacyAccessOnSignIn(subject: Subject): Promise<{ converted: number; left: number }>;
  reportLegacyAccessLimits(): Promise<number>;
  getAttentionItems(): Array<{ reason?: string; details?: string[] }>;
}

const ADMIN_RULE = { id: 'admin-full-access', effect: 'allow', subjects: [{ type: 'role', value: 'admin' }], actions: ['admin-system'] };
const ROOT_ID = 'urn:uuid:11111111-1111-4111-8111-111111111111';
const BOB_ID = 'urn:uuid:22222222-2222-4222-8222-222222222222';
const ROOT: Subject = { username: 'root', roles: ['admin'], isAuthenticated: true };
const BOB: Subject = { username: 'bob', roles: ['editor'], isAuthenticated: true };
const ROLES: Record<string, string[]> = { root: ['admin'], bob: ['editor'] };
const ROOT_PAGE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('the upgrade clean-up reaches a vault page on disk (#2514)', () => {
  let testDir: string;
  let pagesDir: string;
  let provider: FileSystemProvider;
  let manager: TestManager;

  const pageFile = (owner: string, uuid: string): string => path.join(pagesDir, 'vaults', owner, 'notes', `${uuid}.md`);
  const backupDir = (): string => path.join(testDir, 'upgrade-backups');
  const backups = (): string[] => (fs.existsSync(backupDir()) ? fs.readdirSync(backupDir()) : []);
  const bannerText = (): string => manager.getAttentionItems().flatMap((i) => [i.reason ?? '', ...(i.details ?? [])]).join('\n');

  /** A vault page as it was written before v5.47: an old `edit: [admin]` limit, by the vault's owner. */
  async function writeVaultPage(owner: string, uuid: string, authorId: string): Promise<void> {
    await fs.ensureDir(path.dirname(pageFile(owner, uuid)));
    await fs.writeFile(
      pageFile(owner, uuid),
      `---\ntitle: Secret Plans\nuuid: ${uuid}\nauthor: '${authorId}'\nprivate: true\nsystem-category: general\naccess:\n  edit:\n    - admin\n---\nbody text\n`
    );
  }

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-legacy-access-2514-'));
    pagesDir = path.join(testDir, 'pages');
    const settings: Record<string, unknown> = {
      'ngdpbase.page.enabled': true,
      'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
      'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
      'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
      'ngdpbase.system-category': { general: { label: 'general', storageLocation: { defaultstore: 'pages/' } } }
    };
    const config = {
      getProperty: vi.fn((key: string, def: unknown) => (settings[key] !== undefined ? settings[key] : def)),
      getResolvedDataPath: vi.fn((key: string, def: unknown) => (key === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : (settings[key] ?? def))),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    let validation: unknown = null;
    const stand: Record<string, unknown> = {
      ConfigurationManager: config,
      PolicyDecisionPoint: {
        ...ALLOWING_PDP,
        policies: () => [ADMIN_RULE],
        permits: async (s: { username: string; roles?: string[] }, action: string) => {
          const roles = Array.isArray(s.roles) ? s.roles : (ROLES[s.username] ?? []);
          return action !== 'admin-system' || roles.includes('admin');
        }
      },
      IdentityManager: {
        usernameOf: async (_c: unknown, s: string) => (s === ROOT_ID ? 'root' : s === BOB_ID ? 'bob' : s),
        storedReferenceOf: async (_c: unknown, n: string) => n
      },
      UserManager: { getUser: async (u: string) => ({ username: u, isActive: true }) }
    };
    const engine = { getManager: vi.fn(withWriteDoorAllowing((name: string) => (name === 'ValidationManager' ? validation : (stand[name] ?? null)))) };
    validation = new ValidationManager(engine);
    // A vault page on disk, before the provider starts, as it is after an upgrade.
    await writeVaultPage('root', ROOT_PAGE, ROOT_ID);
    provider = new FileSystemProvider(engine);
    await provider.initialize();
    manager = new PageManager(engine);
    manager.provider = provider;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(testDir);
  });

  test('the real provider\'s page list leaves the vault page out (the premise)', async () => {
    expect((await provider.getAllPageInfo()).map((p) => p.uuid)).not.toContain(ROOT_PAGE);
  });

  test('the store listing does name it, for its owner only', async () => {
    const ctx = (username: string) => ({ username, roles: [], isAuthenticated: true });
    expect((await provider.listPrivateStorePages(ctx('root'), 'root')).map((p) => p.uuid)).toEqual([ROOT_PAGE]);
    expect(await provider.listPrivateStorePages(ctx('bob'), 'bob')).toEqual([]);
  });

  test('start-up counts the vault page, and the banner counts it as a private page without a title', async () => {
    expect(await manager.reportLegacyAccessLimits()).toBe(1);
    expect(bannerText()).toMatch(/1 private page \(not named here\)/);
    expect(bannerText()).not.toContain('Secret Plans');
  });

  test('the owner signs in: the vault page gets an Author Lock, with a copy in upgrade-backups, and the banner drops it', async () => {
    await manager.reportLegacyAccessLimits();
    expect(await manager.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
    const text = await fs.readFile(pageFile('root', ROOT_PAGE), 'utf8');
    expect(text).not.toMatch(/^access:/m);
    expect(text).toMatch(/author-lock: true/);
    expect(backups()).toEqual([`${ROOT_PAGE}.md`]);
    expect(bannerText()).not.toMatch(/\(not named here\)/);
  });

  test('another person\'s sign-in leaves the owner\'s vault page as it is, and has no copy of it', async () => {
    const before = await fs.readFile(pageFile('root', ROOT_PAGE), 'utf8');
    expect(await manager.convertLegacyAccessOnSignIn(BOB)).toEqual({ converted: 0, left: 0 });
    expect(await fs.readFile(pageFile('root', ROOT_PAGE), 'utf8')).toBe(before);
    expect(backups()).toEqual([]);
  });
});
