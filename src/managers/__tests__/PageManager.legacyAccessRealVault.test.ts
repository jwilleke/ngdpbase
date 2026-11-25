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
import logger from '../../utils/logger';
import { privateUserKeysPath, storeMetaPath, storePageIndexPath } from '../../utils/privateStorePath';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys, sealBytes, unwrapDek } from '../../utils/privateStoreCrypto';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';
import { ALLOWING_PDP, withWriteDoorAllowing } from '../../__tests__/__fixtures__/pageWriteDoor';

interface Subject { username: string; roles: string[]; isAuthenticated: boolean; privateStoreHandle?: string }
interface TestManager {
  provider: unknown;
  convertLegacyAccessOnSignIn(subject: Subject): Promise<{ converted: number; left: number }>;
  reportLegacyAccessLimits(): Promise<number>;
  getAttentionItems(): Array<{ reason?: string; details?: string[] }>;
}

const ADMIN_RULE = { id: 'admin-full-access', effect: 'allow', subjects: [{ type: 'role', value: 'admin' }], actions: ['admin-system'] };
const ROOT_ID = 'urn:uuid:11111111-1111-4111-8111-111111111111';
const BOB_ID = 'urn:uuid:22222222-2222-4222-8222-222222222222';
const MOLLY_ID = 'urn:uuid:33333333-3333-4333-8333-333333333333';
const ROOT: Subject = { username: 'root', roles: ['admin'], isAuthenticated: true };
const BOB: Subject = { username: 'bob', roles: ['editor'], isAuthenticated: true };
// Molly's vault is encrypted: the key is held by the session handle 'sid' only.
const MOLLY_OPEN: Subject = { username: 'molly', roles: ['editor'], isAuthenticated: true, privateStoreHandle: 'sid' };
const MOLLY_CLOSED: Subject = { username: 'molly', roles: ['editor'], isAuthenticated: true };
const ROLES: Record<string, string[]> = { root: ['admin'], bob: ['editor'], molly: ['editor'] };
const ROOT_PAGE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB_PAGE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MOLLY_PAGE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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
        usernameOf: async (_c: unknown, s: string) => (s === ROOT_ID ? 'root' : s === BOB_ID ? 'bob' : s === MOLLY_ID ? 'molly' : s),
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
    clearUnlockedPrivateStores();
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
    // The copy is the file as it was, with its old limit.
    expect(backups()).toHaveLength(1);
    expect(backups()[0]).toMatch(new RegExp(`-${ROOT_PAGE}\\.md$`));
    expect(await fs.readFile(path.join(backupDir(), backups()[0]), 'utf8')).toMatch(/^access:/m);
    expect(bannerText()).not.toMatch(/\(not named here\)/);
  });

  test('another person\'s sign-in leaves the owner\'s vault page as it is, and has no copy of it', async () => {
    const before = await fs.readFile(pageFile('root', ROOT_PAGE), 'utf8');
    expect(await manager.convertLegacyAccessOnSignIn(BOB)).toEqual({ converted: 0, left: 0 });
    expect(await fs.readFile(pageFile('root', ROOT_PAGE), 'utf8')).toBe(before);
    expect(backups()).toEqual([]);
  });

  // ── Encrypted (sealed) vaults, damaged vaults and the log ────────────────

  const signInDone = (): string[] => {
    const file = path.join(testDir, 'upgrade-signin-done.json');
    return fs.existsSync(file) ? (fs.readJsonSync(file) as { users: string[] }).users : [];
  };
  const mollyFile = (): string => path.join(pagesDir, 'vaults', 'molly', 'secrets', `${MOLLY_PAGE}.md`);

  /** Molly's encrypted vault `secrets`, holding one page with an old `edit: [admin]` limit, sealed as the real storage seals it. */
  async function sealedMollyVault(): Promise<void> {
    const created = await createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(created.kek);
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', 'secrets')));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'secrets'), record);
    const dek = unwrapDek(created.kek, record);
    const text = `---\ntitle: Sealed Plans\nuuid: ${MOLLY_PAGE}\nauthor: '${MOLLY_ID}'\nprivate: true\nsystem-category: general\naccess:\n  edit:\n    - admin\n---\nsealed body text\n`;
    await fs.writeFile(mollyFile(), sealBytes(dek, Buffer.from(text, 'utf8')));
    const entry = {
      title: 'Sealed Plans', uuid: MOLLY_PAGE, filename: `${MOLLY_PAGE}.md`, currentVersion: 0, location: 'private', creator: 'molly',
      store: 'secrets', lastModified: '2026-01-01T00:00:00.000Z', editor: 'molly', author: MOLLY_ID, hasVersions: false, isPrivate: true
    };
    await fs.writeFile(storePageIndexPath(pagesDir, 'molly', 'secrets'), sealBytes(dek, Buffer.from(JSON.stringify({ version: 1, pages: { [MOLLY_PAGE]: entry } }))));
    // The key is in the session 'sid' only; MOLLY_CLOSED carries no handle.
    unlockPrivateStores('sid', 'molly', created.kek);
    setUnlockedDek('sid', 'secrets', dek);
  }

  async function writeBobVaultPage(): Promise<void> {
    await writeVaultPage('bob', BOB_PAGE, BOB_ID);
    await fs.writeJson(storePageIndexPath(pagesDir, 'bob', 'notes'), { version: 1, pages: { [BOB_PAGE]: {
      title: 'Secret Plans', uuid: BOB_PAGE, filename: `${BOB_PAGE}.md`, currentVersion: 0, location: 'private', creator: 'bob',
      store: 'notes', lastModified: '2026-01-01T00:00:00.000Z', editor: 'bob', author: BOB_ID, hasVersions: false, isPrivate: true
    } } });
  }

  /** Everything the loggers said, with their extra arguments, until the returned function is called. */
  function captureLogs(): () => string {
    const lines: string[] = [];
    for (const level of ['info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(logger, level).mockImplementation(((...a: unknown[]) => {
        lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
        return logger;
      }) as never);
    }
    return () => lines.join('\n');
  }

  test('a vault that is closed at sign-in does not mark its owner done: a later sign-in with it open converts the page', async () => {
    await sealedMollyVault();
    expect(await manager.convertLegacyAccessOnSignIn(MOLLY_CLOSED)).toEqual({ converted: 0, left: 0 });
    expect(signInDone()).not.toContain('molly');
    expect(await manager.convertLegacyAccessOnSignIn(MOLLY_OPEN)).toEqual({ converted: 1, left: 0 });
    expect(signInDone()).toContain('molly');
    // Opened with the key, the page has its Author Lock and no old limit.
    const page = await provider.getPage('vaults/molly/secrets/Sealed Plans', MOLLY_OPEN);
    expect(page?.metadata).toMatchObject({ 'author-lock': true });
    expect(page?.metadata).not.toHaveProperty('access');
  });

  test('a person with no vault, or only open ones with nothing to convert, is recorded as done', async () => {
    expect(await manager.convertLegacyAccessOnSignIn(BOB)).toEqual({ converted: 0, left: 0 });
    expect(signInDone()).toContain('bob');
  });

  test('an open encrypted vault page is backed up as the sealed file it was, which restores the page', async () => {
    await sealedMollyVault();
    const before = await fs.readFile(mollyFile());
    expect(await manager.convertLegacyAccessOnSignIn(MOLLY_OPEN)).toEqual({ converted: 1, left: 0 });
    expect(await fs.readFile(mollyFile())).not.toEqual(before);
    expect(backups()).toHaveLength(1);
    const copy = path.join(backupDir(), backups()[0]);
    // Byte for byte: ciphertext in, ciphertext out, so nothing of the page is in the clear outside its vault.
    expect(await fs.readFile(copy)).toEqual(before);
    expect(await fs.readFile(copy, 'latin1')).not.toContain('sealed body text');
    if (process.platform !== 'win32') expect(fs.statSync(copy).mode & 0o777).toBe(0o600);
    // Put the copy back: the vault page opens again as it was, with its old limit.
    await fs.writeFile(mollyFile(), await fs.readFile(copy));
    const restored = await provider.getPage('vaults/molly/secrets/Sealed Plans', MOLLY_OPEN);
    expect(restored?.content).toContain('sealed body text');
    expect(restored?.metadata).toMatchObject({ access: { edit: ['admin'] } });
  });

  test('a damaged vault page file puts no page name and no path in any log line from the scan or the sign-in pass', async () => {
    const logs = captureLogs();
    // The index lists the page, its file is gone.
    await fs.remove(pageFile('root', ROOT_PAGE));
    await manager.reportLegacyAccessLimits();
    await manager.convertLegacyAccessOnSignIn(ROOT);
    const said = logs();
    expect(said).not.toContain('Secret Plans');
    expect(said).not.toContain(testDir);
    expect(said).not.toContain('vaults/root');
    expect(said).not.toContain('notes');
  });

  test('a corrupt vault index skips only that vault: the scan still counts the other owners\' pages', async () => {
    await fs.ensureDir(path.join(pagesDir, 'vaults', 'zed', 'broken'));
    await fs.writeFile(storePageIndexPath(pagesDir, 'zed', 'broken'), '{ not json');
    expect(await manager.reportLegacyAccessLimits()).toBe(1);
  });

  test('a corrupt vault index of the owner skips that vault only: their other vault is converted, and they are tried again at the next sign-in', async () => {
    await fs.ensureDir(path.join(pagesDir, 'vaults', 'root', 'broken'));
    await fs.writeFile(storePageIndexPath(pagesDir, 'root', 'broken'), '{ not json');
    expect(await manager.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
    expect(signInDone()).not.toContain('root');
  });

  test('a sign-in lists the signed-in person\'s vaults only, and leaves another owner\'s page and copies alone', async () => {
    await writeBobVaultPage();
    const listing = vi.spyOn(provider as unknown as { listPrivateStorePageInfo(...a: unknown[]): Promise<unknown> }, 'listPrivateStorePageInfo');
    const rootBefore = await fs.readFile(pageFile('root', ROOT_PAGE), 'utf8');
    expect(await manager.convertLegacyAccessOnSignIn(BOB)).toEqual({ converted: 1, left: 0 });
    // Asked for one owner, never for everyone's.
    expect(listing.mock.calls.map((c) => c[1])).toEqual(['bob']);
    expect(await fs.readFile(pageFile('root', ROOT_PAGE), 'utf8')).toBe(rootBefore);
    expect(backups()).toHaveLength(1);
    expect(backups()[0]).toContain(BOB_PAGE);
  });
});
