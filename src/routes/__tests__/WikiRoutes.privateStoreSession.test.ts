/**
 * Password login unwraps the user KEK into the process bag (#1391).
 * Logout drops that bag for the session id (#1392).
 *
 * A helper that exists but is not wired on the login/logout door protects nothing.
 * Keys are not express-session JSON.
 */

import { format } from 'util';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import WikiRoutes from '../WikiRoutes';
import logger from '../../utils/logger';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  unwrapDek
} from '../../utils/privateStoreCrypto';
import { privateUserKeysPath, storeMetaPath } from '../../utils/privateStorePath';
import {
  clearUnlockedPrivateStores,
  getUnlockedDek,
  getUnlockedKek,
  unlockPrivateStores
} from '../../utils/privateStoreUnlock';

const kdf = TEST_PRIVATE_STORE_KDF;

const createMockRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis()
});

function createMockSession(id = 'attacker-planted-id') {
  const session: Record<string, unknown> = {
    id,
    regenerate: vi.fn((cb: (err?: unknown) => void) => {
      session.id = 'regenerated-id';
      cb();
    }),
    save: vi.fn((cb: (err?: unknown) => void) => cb()),
    destroy: vi.fn((cb: (err?: unknown) => void) => cb())
  };
  return session;
}

const createMockReq = (body: Record<string, unknown>, session: Record<string, unknown>) => ({
  body,
  params: {},
  query: {},
  session,
  get sessionID() {
    return session.id;
  },
  path: '/login',
  originalUrl: '/login',
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: null
});

function makeRoutes(opts: {
  pagesDir: string;
  authSucceeds?: boolean;
  username?: string;
  audit?: { payload?: unknown };
}) {
  const username = opts.username ?? 'molly';
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'AuthManager') {
        return {
          authenticate: vi.fn().mockResolvedValue(
            opts.authSucceeds === false
              ? { success: false }
              : { success: true, username }
          )
        };
      }
      if (name === 'ConfigurationManager') {
        return {
          getProperty: vi.fn((_k: string, d: unknown) => d),
          getResolvedDataPath: vi.fn((_k: string, d: string) =>
            _k === 'ngdpbase.page.provider.filesystem.storagedir' ? opts.pagesDir : d
          )
        };
      }
      if (name === 'UserManager') return { authenticateUser: vi.fn().mockResolvedValue(null), getUser: vi.fn().mockResolvedValue(null) };
      if (name === 'MetricsManager') return { recordLoginAttempt: vi.fn() };
      if (name === 'AuditManager') {
        return {
          logAuthentication: vi.fn(async (context: Record<string, unknown>, result: string, reason: string) => {
            if (opts.audit) opts.audit.payload = { context, result, reason };
            return 'audit-id';
          })
        };
      }
      return null;
    })
  };
  return new WikiRoutes(engine) as unknown as {
    processLogin(req: unknown, res: unknown): Promise<void>;
    processLogout(req: unknown, res: unknown): void;
  };
}

describe('private store session bag (#1391, #1392)', () => {
  let pagesDir: string;
  let tmp: string;
  const logs: string[] = [];

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'priv-login-'));
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
    logs.length = 0;
    const capture = (...args: unknown[]) => {
      logs.push(format(...args));
      return logger;
    };
    vi.spyOn(logger, 'info').mockImplementation(capture as typeof logger.info);
    vi.spyOn(logger, 'warn').mockImplementation(capture as typeof logger.warn);
    vi.spyOn(logger, 'error').mockImplementation(capture as typeof logger.error);
    vi.spyOn(logger, 'debug').mockImplementation(capture as typeof logger.debug);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  test('successful password login unwraps the KEK and store DEK into the bag, not session JSON', async () => {
    const created = createUserKeys('correct-horse', { kdf });
    const store = createEncryptedStore(created.kek);
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', 'yourphr')));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'yourphr'), store);

    const session = createMockSession();
    const audit: { payload?: unknown } = {};
    await makeRoutes({ pagesDir, audit }).processLogin(
      createMockReq({ username: 'molly', password: 'correct-horse' }, session),
      createMockRes()
    );

    expect(session.id).toBe('regenerated-id');
    // The bag is keyed by a random handle on the session — never the session id (#1382).
    const handle = session.privateStoreHandle as string;
    expect(typeof handle).toBe('string');
    expect(handle).not.toBe('regenerated-id');
    expect(handle).not.toBe('attacker-planted-id');
    expect(getUnlockedKek(handle)).toEqual(created.kek);
    expect(getUnlockedDek(handle, 'yourphr')).toEqual(unwrapDek(created.kek, store));
    expect(getUnlockedKek('regenerated-id')).toBeUndefined();
    expect(getUnlockedKek('attacker-planted-id')).toBeUndefined();

    const json = JSON.stringify(session);
    expect(json).not.toContain(created.kek.toString('base64'));
    expect(json).not.toContain(created.kek.toString('hex'));
    expect(json).not.toContain(created.mnemonic.split(' ')[0]);
    expect(json).not.toContain('correct-horse');

    const combined = `${logs.join('\n')}\n${JSON.stringify(audit.payload)}`;
    expect(combined).not.toContain('correct-horse');
    expect(combined).not.toContain(created.kek.toString('base64'));
    expect(combined).not.toContain(created.kek.toString('hex'));
    expect(combined).not.toContain(created.mnemonic);
  });

  test('failed login does not unlock even when the posted password would unwrap the envelope', async () => {
    const created = createUserKeys('correct-horse', { kdf });
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);

    const session = createMockSession();
    await makeRoutes({ pagesDir, authSucceeds: false }).processLogin(
      createMockReq({ username: 'molly', password: 'correct-horse' }, session),
      createMockRes()
    );

    expect(getUnlockedKek(session.id as string)).toBeUndefined();
    expect(getUnlockedKek('regenerated-id')).toBeUndefined();
    expect(session.privateStoreHandle).toBeUndefined();
  });

  test('logout drops KEK and DEK for that session and leaves other sessions unlocked', async () => {
    const created = createUserKeys('correct-horse', { kdf });
    const store = createEncryptedStore(created.kek);
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', 'yourphr')));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'yourphr'), store);

    const other = createUserKeys('other-pw', { kdf });
    unlockPrivateStores('other-sid', 'bob', other.kek);

    const session = createMockSession();
    const routes = makeRoutes({ pagesDir });
    await routes.processLogin(
      createMockReq({ username: 'molly', password: 'correct-horse' }, session),
      createMockRes()
    );
    const handle = session.privateStoreHandle as string;
    expect(getUnlockedKek(handle)).toBeDefined();

    routes.processLogout(
      createMockReq({}, session),
      createMockRes()
    );

    expect(getUnlockedKek(handle)).toBeUndefined();
    expect(getUnlockedDek(handle, 'yourphr')).toBeUndefined();
    expect(getUnlockedKek('other-sid')).toEqual(other.kek);

    const json = JSON.stringify(session);
    expect(json).not.toContain(created.kek.toString('base64'));
    expect(json).not.toContain(created.kek.toString('hex'));
    expect(json).not.toContain('correct-horse');

    const combined = logs.join('\n');
    expect(combined).not.toContain('correct-horse');
    expect(combined).not.toContain(created.kek.toString('base64'));
    expect(combined).not.toContain(created.kek.toString('hex'));
    expect(combined).not.toContain(created.mnemonic);
    expect(session.destroy).toHaveBeenCalled();
  });
});
