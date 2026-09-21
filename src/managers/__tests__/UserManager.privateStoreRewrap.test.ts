/**
 * Password change re-wraps the user KEK envelope (#1393).
 *
 * The profile door has current+new password; updateUser is the write that
 * must persist the new wrap. Recovery wrap is unchanged. currentPassword
 * must not land on the stored user record.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import UserManager from '../UserManager';
import type { WikiEngine } from '../../types/WikiEngine';
import {
  TEST_PRIVATE_STORE_KDF,
  createUserKeys,
  unwrapKekWithMnemonic,
  unwrapKekWithPassword
} from '../../utils/privateStoreCrypto';
import { privateUserKeysPath } from '../../utils/privateStorePath';

const ACTOR = { username: 'molly', roles: ['editor'], isAuthenticated: true };
const kdf = TEST_PRIVATE_STORE_KDF;

function makeManager(pagesDir: string) {
  const users = new Map<string, Record<string, unknown>>();
  const provider = {
    userExists: vi.fn(async (name: string) => users.has(name)),
    createUser: vi.fn(async (u: Record<string, unknown>) => {
      users.set(u.username as string, { ...u });
    }),
    getUser: vi.fn(async (name: string) => users.get(name) ?? null),
    updateUser: vi.fn(async (name: string, u: Record<string, unknown>) => {
      users.set(name, { ...u });
    }),
    deleteUser: vi.fn(async (name: string) => {
      users.delete(name);
    })
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'AuditManager') {
        return { logAuditEvent: vi.fn().mockResolvedValue('id'), flushAuditQueue: () => Promise.resolve() };
      }
      if (name === 'ConfigurationManager') {
        return {
          getProperty: (k: string, d: unknown) => (k === 'ngdpbase.system.principal' ? 'system' : d),
          getResolvedDataPath: (k: string, d: string) =>
            k === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : d
        };
      }
      return null;
    })
  } as unknown as WikiEngine;
  const um = new UserManager(engine);
  (um as unknown as { provider: unknown }).provider = provider;
  (um as unknown as { resolveUserRoles: (n: string) => Promise<string[]> }).resolveUserRoles =
    async () => [];
  (um as unknown as { applyRoleDiff: () => Promise<void> }).applyRoleDiff = async () => undefined;
  (um as unknown as { syncPersonOnUpdate: () => Promise<void> }).syncPersonOnUpdate = async () => undefined;
  return { um, users };
}

describe('UserManager password rewrap (#1393)', () => {
  let tmp: string;
  let pagesDir: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'priv-rewrap-'));
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(pagesDir);
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  test('updateUser with current+new password re-wraps the envelope; mnemonic still works', async () => {
    const created = createUserKeys('old-pw', { kdf });
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);

    const { um, users } = makeManager(pagesDir);
    users.set('molly', {
      username: 'molly',
      email: 'm@x',
      displayName: 'Molly',
      password: 'hashed-old',
      isExternal: false
    });

    await um.updateUser(
      'molly',
      { password: 'new-pw', currentPassword: 'old-pw' },
      ACTOR
    );

    const stored = users.get('molly');
    expect(stored.currentPassword).toBeUndefined();
    expect(stored.password).not.toBe('new-pw');
    expect(stored.password).not.toBe('old-pw');

    const envelope = await fs.readJson(privateUserKeysPath(pagesDir, 'molly'));
    expect(Buffer.compare(unwrapKekWithPassword(envelope, 'new-pw'), created.kek)).toBe(0);
    expect(() => unwrapKekWithPassword(envelope, 'old-pw')).toThrow(/password/i);
    expect(Buffer.compare(unwrapKekWithMnemonic(envelope, created.mnemonic), created.kek)).toBe(0);
  });

  test('password change without an envelope still updates the account', async () => {
    const { um, users } = makeManager(pagesDir);
    users.set('molly', {
      username: 'molly',
      email: 'm@x',
      displayName: 'Molly',
      password: 'hashed-old',
      isExternal: false
    });

    await um.updateUser('molly', { password: 'new-pw', currentPassword: 'old-pw' }, ACTOR);

    expect(users.get('molly').password).not.toBe('new-pw');
    expect(await fs.pathExists(privateUserKeysPath(pagesDir, 'molly'))).toBe(false);
  });
});
