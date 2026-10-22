/**
 * #1976 — admins are reminded to save `.env` when its key set changes.
 *
 * The names (never the values) the instance `.env` sets are compared with the
 * ones recorded when an admin last confirmed it saved: a name added or
 * removed lists BackupManager as needing attention and notifies admins once;
 * "I have saved .env off the server" records the names (and the backup key,
 * when the file holds it) and clears it. The first check on a site with
 * nothing recorded records the baseline without asking.
 *
 * Real BackupManager with no backup provider (so only the save reminders
 * decide its state), a real `.env` in a mkdtemp directory; each test removes
 * only that directory. Every value here is made up.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BackupManager, { ENV_KEYS_CHANGED_TITLE, ENV_KEYS_SAVED_KEY } from '../BackupManager';
import { BACKUP_KEY_ENV, backupKeyFingerprint } from '../../utils/backupKey';
import logger from '../../utils/logger';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true };
const KEY = 'made-up-backup-key-value-1976';
const VALUES = ['session-value-not-a-secret', 'credentials-value-not-a-secret', KEY, 'smtp value not a secret'];

describe('the reminder to save .env when its key set changes (#1976)', () => {
  let dir: string;
  let props: Record<string, unknown>;
  let notifications: Array<{ level: string; title: string; message: string }>;
  let logged: string[];
  let customConfigPath: string | undefined;
  const savedKey = process.env[BACKUP_KEY_ENV];

  const writeEnv = (names: string[]): void => {
    const lines: Record<string, string> = {
      NGDPBASE_SESSION_SECRET: `NGDPBASE_SESSION_SECRET=${VALUES[0]}`,
      NGDPBASE_CREDENTIALS_KEY: `NGDPBASE_CREDENTIALS_KEY=${VALUES[1]}`,
      [BACKUP_KEY_ENV]: `${BACKUP_KEY_ENV}=${KEY}`,
      SMTP_PASSWORD: `SMTP_PASSWORD="${VALUES[3]}"`
    };
    fs.writeFileSync(path.join(dir, '.env'), `# made by the site\n${names.map((n) => lines[n]).join('\n')}\n`, { mode: 0o600 });
  };

  /** One start of the site: a new BackupManager over the same files, settings and stored notifications. */
  async function start(): Promise<BackupManager> {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k in props ? props[k] : d),
        getInstanceDataFolder: () => dir,
        getCustomConfigPath: () => customConfigPath,
        setProperty: async (k: string, v: unknown) => { props[k] = v; }
      },
      NotificationManager: {
        addNotification: async (n: { level: string; title: string; message: string }) => { notifications.push(n); return 'id'; },
        getAllNotifications: () => notifications
      }
    };
    const bm = new BackupManager({ getManager: (n: string) => managers[n] ?? null });
    await bm.refreshBackupHealth();
    return bm;
  }

  const reminders = () => notifications.filter((n) => n.title === ENV_KEYS_CHANGED_TITLE);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1976-'));
    process.env[BACKUP_KEY_ENV] = KEY;
    props = { 'ngdpbase.backup.key-saved-fingerprint': backupKeyFingerprint(KEY) };
    notifications = [];
    logged = [];
    customConfigPath = undefined;
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => { logged.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')); }));
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedKey === undefined) delete process.env[BACKUP_KEY_ENV]; else process.env[BACKUP_KEY_ENV] = savedKey;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('first start with nothing recorded: the names are recorded silently, nothing asks', async () => {
    writeEnv(['NGDPBASE_SESSION_SECRET', BACKUP_KEY_ENV, 'NGDPBASE_CREDENTIALS_KEY']);
    const bm = await start();
    expect(props[ENV_KEYS_SAVED_KEY]).toEqual(['NGDPBASE_BACKUP_KEY', 'NGDPBASE_CREDENTIALS_KEY', 'NGDPBASE_SESSION_SECRET']);
    expect(bm.getManagerStatus()).toEqual({ state: 'ready' });
    expect(notifications).toEqual([]);
  });

  test('a site not installed yet (no custom configuration file) records nothing until it is', async () => {
    writeEnv(['NGDPBASE_SESSION_SECRET', BACKUP_KEY_ENV]);
    customConfigPath = path.join(dir, 'config', 'app-custom-config.json');
    const bm = await start();
    expect(props[ENV_KEYS_SAVED_KEY]).toBeUndefined();
    expect(bm.getManagerStatus()).toEqual({ state: 'ready' });
    fs.mkdirSync(path.dirname(customConfigPath));
    fs.writeFileSync(customConfigPath, '{}');
    await start();
    expect(props[ENV_KEYS_SAVED_KEY]).toEqual(['NGDPBASE_BACKUP_KEY', 'NGDPBASE_SESSION_SECRET']);
    expect(notifications).toEqual([]);
  });

  test('unchanged names stay clear across restarts', async () => {
    writeEnv(['NGDPBASE_SESSION_SECRET', BACKUP_KEY_ENV]);
    await start();
    const restarted = await start();
    expect(restarted.getManagerStatus()).toEqual({ state: 'ready' });
    expect(notifications).toEqual([]);
  });

  test('an added key (one ngdpbase generated, or a hand edit) raises it, once across restarts', async () => {
    props[ENV_KEYS_SAVED_KEY] = ['NGDPBASE_BACKUP_KEY', 'NGDPBASE_SESSION_SECRET'];
    writeEnv(['NGDPBASE_SESSION_SECRET', BACKUP_KEY_ENV, 'NGDPBASE_CREDENTIALS_KEY']);
    const bm = await start();
    expect(bm.getManagerStatus()).toMatchObject({ state: 'degraded', kind: 'attention', configKey: ENV_KEYS_SAVED_KEY, reason: expect.stringContaining('added: NGDPBASE_CREDENTIALS_KEY') });
    expect(reminders()).toHaveLength(1);
    expect(reminders()[0].message).toMatch(/Download \.env on Admin → Backup/);
    await start();
    expect(reminders()).toHaveLength(1);
  });

  test('a removed key raises it', async () => {
    props[ENV_KEYS_SAVED_KEY] = ['NGDPBASE_BACKUP_KEY', 'NGDPBASE_SESSION_SECRET', 'SMTP_PASSWORD'];
    writeEnv(['NGDPBASE_SESSION_SECRET', BACKUP_KEY_ENV]);
    const bm = await start();
    expect(bm.getManagerStatus()).toMatchObject({ kind: 'attention', reason: expect.stringContaining('removed: SMTP_PASSWORD') });
    expect(reminders()).toHaveLength(1);
  });

  test('confirming .env saved records the names and clears it; a restart keeps it clear', async () => {
    props[ENV_KEYS_SAVED_KEY] = ['NGDPBASE_BACKUP_KEY'];
    writeEnv([BACKUP_KEY_ENV, 'SMTP_PASSWORD']);
    const bm = await start();
    const info = bm.envKeysInfo()!;
    await bm.confirmBackupKeySaved(CTX, backupKeyFingerprint(KEY), info.fingerprint);
    expect(props[ENV_KEYS_SAVED_KEY]).toEqual(['NGDPBASE_BACKUP_KEY', 'SMTP_PASSWORD']);
    expect(bm.getManagerStatus()).toEqual({ state: 'ready' });
    expect((await start()).getManagerStatus()).toEqual({ state: 'ready' });
    expect(reminders()).toHaveLength(1);
  });

  test('a page loaded before the names changed is refused', async () => {
    props[ENV_KEYS_SAVED_KEY] = ['NGDPBASE_BACKUP_KEY'];
    writeEnv([BACKUP_KEY_ENV, 'SMTP_PASSWORD']);
    const bm = await start();
    const stale = bm.envKeysInfo()!.fingerprint;
    writeEnv([BACKUP_KEY_ENV, 'SMTP_PASSWORD', 'NGDPBASE_SESSION_SECRET']);
    await expect(bm.confirmBackupKeySaved(CTX, backupKeyFingerprint(KEY), stale)).rejects.toThrow(/changed since that page was loaded/);
    expect(props[ENV_KEYS_SAVED_KEY]).toEqual(['NGDPBASE_BACKUP_KEY']);
  });

  test('one confirmation for both: with the key not yet saved, its reminder comes first, and saving .env (which holds it) clears both', async () => {
    props = { [ENV_KEYS_SAVED_KEY]: ['NGDPBASE_BACKUP_KEY'] };
    writeEnv([BACKUP_KEY_ENV, 'NGDPBASE_SESSION_SECRET']);
    const bm = await start();
    expect(bm.getManagerStatus().reason).toMatch(/^Save the backup key off this server/);
    expect(reminders()).toHaveLength(1);
    const info = bm.envKeysInfo()!;
    expect(info.holdsBackupKey).toBe(true);
    await bm.confirmBackupKeySaved(CTX, backupKeyFingerprint(KEY), info.fingerprint);
    expect(props['ngdpbase.backup.key-saved-fingerprint']).toBe(backupKeyFingerprint(KEY));
    expect(bm.getManagerStatus()).toEqual({ state: 'ready' });
  });

  test('a .env without the backup key in it does not count as a saved key', async () => {
    props = { [ENV_KEYS_SAVED_KEY]: [] };
    writeEnv(['NGDPBASE_SESSION_SECRET']);
    const bm = await start();
    await bm.confirmBackupKeySaved(CTX, '', bm.envKeysInfo()!.fingerprint);
    expect(props['ngdpbase.backup.key-saved-fingerprint']).toBeUndefined();
    expect(props[ENV_KEYS_SAVED_KEY]).toEqual(['NGDPBASE_SESSION_SECRET']);
    expect(bm.getManagerStatus().reason).toMatch(/^Save the backup key off this server/);
  });

  test('values never reach the settings, the notifications, the dashboard or the log', async () => {
    props[ENV_KEYS_SAVED_KEY] = ['NGDPBASE_SESSION_SECRET'];
    writeEnv(['NGDPBASE_SESSION_SECRET', 'NGDPBASE_CREDENTIALS_KEY', BACKUP_KEY_ENV, 'SMTP_PASSWORD']);
    const bm = await start();
    const info = bm.envKeysInfo()!;
    await bm.confirmBackupKeySaved(CTX, backupKeyFingerprint(KEY), info.fingerprint);
    const everything = JSON.stringify({ props, notifications, status: bm.getManagerStatus(), info, logged });
    expect(reminders()).toHaveLength(1);
    for (const value of VALUES) expect(everything).not.toContain(value);
  });
});
