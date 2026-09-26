/**
 * A forgotten password, reset with the 12 recovery words (#1452).
 *
 * The real key file and real crypto; the user provider and `updateUser` are
 * stand-ins, so what is asserted is the order and the refusals: the key's
 * password wrap is replaced first, then the sign-in password is set through
 * the one door that records it — and every "no" changes nothing.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import UserManager from '../UserManager';
import { TEST_PRIVATE_STORE_KDF, createUserKeys, unwrapKekWithPassword } from '../../utils/privateStoreCrypto';
import { privateUserKeysPath } from '../../utils/privateStorePath';
import type { ActorContext } from '../../context/ActorContext';

const CTX = { username: 'molly', origin: 'request', reason: 'test', requestedAt: new Date().toISOString() } as unknown as ActorContext;

describe('UserManager.resetPasswordWithRecoveryWords (#1452)', () => {
  let tmp: string;
  let pagesDir: string;
  let users: Record<string, Record<string, unknown>>;
  let manager: UserManager;
  let updateUser: ReturnType<typeof vi.fn>;
  let words: string;
  let kek: Buffer;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'um-recover-'));
    pagesDir = path.join(tmp, 'pages');
    const created = createUserKeys('forgotten', { kdf: TEST_PRIVATE_STORE_KDF });
    words = created.mnemonic;
    kek = created.kek;
    await fs.outputJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    users = { molly: { username: 'molly', isActive: true } };

    manager = Object.create(UserManager.prototype) as UserManager;
    const internals = manager as unknown as Record<string, unknown>;
    internals.provider = { getUser: async (u: string) => users[u] ?? null };
    internals.engine = {
      getManager: (name: string) => (name === 'ConfigurationManager' ? { getResolvedDataPath: () => pagesDir } : null)
    };
    updateUser = vi.fn(async () => ({}));
    internals.updateUser = updateUser;
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  const keysOnDisk = () => fs.readJson(privateUserKeysPath(pagesDir, 'molly'));

  test('the right words: the key opens with the new password, then the sign-in password is set through updateUser', async () => {
    expect(await manager.resetPasswordWithRecoveryWords('molly', words, 'brand-new', CTX)).toBe(true);

    expect(Buffer.compare(unwrapKekWithPassword(await keysOnDisk(), 'brand-new'), kek)).toBe(0);
    expect(updateUser).toHaveBeenCalledWith('molly', { password: 'brand-new' }, CTX);
  });

  test.each([
    ['wrong words', () => ({ w: 'abandon '.repeat(12).trim(), u: 'molly' })],
    ['no such account', () => ({ w: words, u: 'nobody' })]
  ])('%s: false, and nothing changes', async (_label, pick) => {
    const before = await keysOnDisk();
    const { w, u } = pick();

    expect(await manager.resetPasswordWithRecoveryWords(u, w, 'brand-new', CTX)).toBe(false);

    expect(await keysOnDisk()).toEqual(before);
    expect(updateUser).not.toHaveBeenCalled();
  });

  test('an external (OAuth) or inactive account is refused, even with the right words', async () => {
    users.molly.isExternal = true;
    expect(await manager.resetPasswordWithRecoveryWords('molly', words, 'brand-new', CTX)).toBe(false);

    users.molly = { username: 'molly', isActive: false };
    expect(await manager.resetPasswordWithRecoveryWords('molly', words, 'brand-new', CTX)).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
