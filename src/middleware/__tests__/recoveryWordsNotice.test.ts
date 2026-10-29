/**
 * The "save your recovery words" banner (#1928): for a signed-in user with
 * encrypted vaults who has not confirmed, at the wording's current version,
 * that they saved their current recovery words — on the dashboard, /profile
 * and their encrypted vaults' pages, naming the vaults. Warn, never force:
 * every request goes on.
 *
 * Real key and store files in a per-test mkdtemp folder (removed afterwards,
 * never a data/ tree); ConsentManager's pendingFor is a stand-in over a set of
 * confirmed (words id, version) pairs.
 *
 * Sabotaged once each (then restored): the subject passed to pendingFor
 * (dropped) — the new-set test went red; the vault filter on vault pages
 * (removed) — the other-vault test went red; the delegated guard (removed) —
 * the token/proxy test went red.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { Request } from 'express';
import { recoveryWordsNotice } from '../recoveryWordsNotice';
import { createUserKeys, recoveryWordsId, TEST_PRIVATE_STORE_KDF } from '../../utils/privateStoreCrypto';
import { privateUserKeysPath, storeMetaPath } from '../../utils/privateStorePath';

const PAGE = { accept: 'text/html,application/xhtml+xml' };

describe('recoveryWordsNotice (#1928)', () => {
  let dir: string;
  let pagesDir: string;
  /** `${wordsId}@${version}` the user has confirmed. */
  let confirmed: Set<string>;
  let version: string;
  let pendingFor: ReturnType<typeof vi.fn>;

  const engine = () => ({
    getManager: (n: string): unknown => {
      if (n === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: () => pagesDir };
      if (n === 'PageManager') {
        return {
          listOwnStoreIds: async (ctx: { username: string }) => {
            const userDir = path.dirname(privateUserKeysPath(pagesDir, ctx.username));
            return (await fs.pathExists(userDir)) ? (await fs.readdir(userDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name) : [];
          }
        };
      }
      if (n === 'ConsentManager') return { pendingFor };
      return null;
    }
  });

  async function giveKeys(user: string): Promise<string> {
    const { envelope } = await createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    await fs.outputJson(privateUserKeysPath(pagesDir, user), envelope);
    return recoveryWordsId(envelope);
  }

  async function giveVault(user: string, vault: string, encrypt: boolean): Promise<void> {
    await fs.outputJson(storeMetaPath(pagesDir, user, vault), encrypt ? { kind: vault, encrypt: true, dekWrap: { iv: 'a', tag: 'b', ct: 'c' } } : { kind: vault, encrypt: false });
  }

  interface Outcome { next: boolean; locals: Record<string, unknown> }
  function run(p: string, extra: { userContext?: Record<string, unknown>; bearerAuth?: boolean; headers?: Record<string, string>; method?: string } = {}): Promise<Outcome> {
    return new Promise((resolve) => {
      const locals: Record<string, unknown> = {};
      const headers = extra.headers ?? PAGE;
      const req = {
        method: extra.method ?? 'GET',
        path: p,
        originalUrl: p,
        get: (h: string) => headers[h.toLowerCase()],
        session: { isAuthenticated: true, username: 'ann' },
        userContext: extra.userContext ?? { username: 'ann', isAuthenticated: true },
        bearerAuth: extra.bearerAuth
      } as unknown as Request;
      recoveryWordsNotice(engine())(req, { locals }, () => resolve({ next: true, locals }));
    });
  }
  const notice = (o: Outcome) => o.locals.recoveryWordsNotice as { message: string; link: string } | undefined;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'recovery-words-notice-'));
    pagesDir = path.join(dir, 'pages');
    confirmed = new Set();
    version = '1';
    pendingFor = vi.fn(async (_u: string, scope: string, subject?: string) =>
      (scope === 'recovery-words' && subject && !confirmed.has(`${subject}@${version}`) ? [{ id: 'recovery-words', scope, title: 'Your Recovery Words', version, effective: null }] : []));
  });

  afterEach(async () => {
    // Only this test's own mkdtemp folder.
    await fs.remove(dir);
  });

  test('an unconfirmed user with encrypted vaults sees it on the dashboard and /profile, naming every encrypted vault and never a plain one', async () => {
    await giveKeys('ann');
    await giveVault('ann', 'health', true);
    await giveVault('ann', 'money', true);
    await giveVault('ann', 'default', false);
    for (const p of ['/admin', '/profile', '/my/vaults']) {
      const r = await run(p);
      expect(r.next).toBe(true);
      expect(notice(r)?.message).toMatch(/Your encrypted vaults "health" and "money" are locked with your own key: nobody, not even an administrator, can open their files\./);
      expect(notice(r)?.message).toMatch(/12 recovery words are the only way back; without them those files are lost for good/);
      expect(notice(r)?.message).not.toMatch(/default|private pages|record/);
      expect(notice(r)?.link).toBe(`/consent?scope=recovery-words&returnTo=${encodeURIComponent(p)}`);
    }
  });

  test('on the user\'s own encrypted vault\'s pages, not on a plain vault\'s or anyone else\'s', async () => {
    await giveKeys('ann');
    await giveVault('ann', 'health', true);
    await giveVault('ann', 'default', false);
    expect(notice(await run('/vaults/ann/health/Blood%20tests'))).toBeDefined();
    expect(notice(await run('/stores/health'))).toBeDefined();
    expect(notice(await run('/vaults/ann/default/Shopping'))).toBeUndefined();
    expect(notice(await run('/vaults/bob/health/Notes'))).toBeUndefined();
    expect(notice(await run('/view/Main'))).toBeUndefined();
  });

  test('it never holds a request: every request goes on, with or without it', async () => {
    await giveKeys('ann');
    await giveVault('ann', 'health', true);
    expect((await run('/profile')).next).toBe(true);
    expect((await run('/api/pages', { method: 'POST', headers: { accept: 'application/json' } })).next).toBe(true);
    pendingFor.mockRejectedValueOnce(new Error('consent folder gone'));
    const broken = await run('/profile');
    expect(broken.next).toBe(true);
    expect(notice(broken)).toBeUndefined();
  });

  test('no banner for a user without encrypted vaults: no keys, or only plain vaults', async () => {
    await giveVault('ann', 'default', false);
    expect(notice(await run('/profile'))).toBeUndefined();
    await giveKeys('ann');
    expect(notice(await run('/profile'))).toBeUndefined();
    expect(pendingFor).not.toHaveBeenCalled();
  });

  test('confirming clears it; a new version of the wording, or a new set of words, brings it back', async () => {
    const first = await giveKeys('ann');
    await giveVault('ann', 'health', true);
    confirmed.add(`${first}@1`);
    expect(notice(await run('/profile'))).toBeUndefined();
    expect(pendingFor).toHaveBeenLastCalledWith('ann', 'recovery-words', first);

    version = '2';
    expect(notice(await run('/profile'))).toBeDefined();
    confirmed.add(`${first}@2`);
    expect(notice(await run('/profile'))).toBeUndefined();

    await fs.remove(privateUserKeysPath(pagesDir, 'ann'));
    const second = await giveKeys('ann'); // a new set of words (#1925)
    expect(second).not.toBe(first);
    expect(notice(await run('/profile'))).toBeDefined();
  });

  test('never for a token, a share link or a proxy, and never on a request that is not a page read', async () => {
    await giveKeys('ann');
    await giveVault('ann', 'health', true);
    expect(notice(await run('/profile', { bearerAuth: true }))).toBeUndefined();
    expect(notice(await run('/profile', { userContext: { username: 'ann', isAuthenticated: true, viaShare: {} } }))).toBeUndefined();
    expect(notice(await run('/profile', { userContext: { username: 'bob', isAuthenticated: true, viaProxy: { grantId: 'g' } } }))).toBeUndefined();
    expect(notice(await run('/profile', { headers: { accept: 'application/json' } }))).toBeUndefined();
  });
});
