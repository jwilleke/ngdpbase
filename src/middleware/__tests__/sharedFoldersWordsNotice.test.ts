/**
 * The shared folders' recovery-words banner (#2124, epic #1775 decision 4):
 * while the organization's words exist and the admin they were shown to has
 * not confirmed saving them (at the wording's current version, for this set),
 * holders of `admin-system` see a banner on the home page, `/admin` and
 * `/admin/backup`. It never holds a request.
 *
 * Stand-ins for SharedFolderManager (`recoveryWordsInfo`), ConsentManager
 * (`pendingFor` over a set of confirmed `user/words@version`) and the PDP
 * (`holds`). No files.
 *
 * Sabotaged once each (then restored): the `holds('admin-system')` check
 * (removed) — the non-admin test went red; the `shownTo` used for pendingFor
 * (another admin's name instead) — the "another admin confirming does not
 * clear it" test went red.
 */
import type { Request } from 'express';
import { recoveryWordsNotice } from '../recoveryWordsNotice';

const PAGE = { accept: 'text/html,application/xhtml+xml' };
const SCOPE = 'shared-folders-recovery-words';

describe('the shared folders\' recovery-words banner (#2124)', () => {
  let words: { wordsId: string; madeAt: string; shownTo: string; protectsFolders: boolean } | null;
  let confirmed: Set<string>;
  let version: string;
  let admins: Set<string>;
  let holdsFails: boolean;

  const engine = () => ({
    getManager: (n: string): unknown => {
      if (n === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: () => '/nonexistent-pages-dir.example' };
      if (n === 'SharedFolderManager') return { recoveryWordsInfo: () => words };
      if (n === 'PolicyDecisionPoint') {
        return { holds: async (s: { username: string }, a: string) => { if (holdsFails) throw new Error('pdp down'); return a === 'admin-system' && admins.has(s.username); } };
      }
      if (n === 'ConsentManager') {
        return {
          pendingFor: async (u: string, scope: string, subject?: string) =>
            (scope === SCOPE && subject && !confirmed.has(`${u}/${subject}@${version}`) ? [{ id: SCOPE, scope, title: 'Shared Folders Recovery Words', version, effective: null }] : [])
        };
      }
      return null;
    }
  });

  interface Outcome { next: boolean; locals: Record<string, unknown> }
  function run(p: string, user = 'ann', extra: { userContext?: Record<string, unknown>; method?: string } = {}): Promise<Outcome> {
    return new Promise((resolve) => {
      const locals: Record<string, unknown> = {};
      const req = {
        method: extra.method ?? 'GET',
        path: p,
        originalUrl: p,
        get: (h: string) => (PAGE as Record<string, string>)[h.toLowerCase()],
        session: { isAuthenticated: true, username: user },
        userContext: extra.userContext ?? { username: user, isAuthenticated: true }
      } as unknown as Request;
      recoveryWordsNotice(engine())(req, { locals }, () => resolve({ next: true, locals }));
    });
  }
  const notice = (o: Outcome) => o.locals.sharedFoldersWordsNotice as { message: string; link: string; mine: boolean } | undefined;

  beforeEach(() => {
    words = { wordsId: 'org-words-1', madeAt: '2026-10-29T12:00:00.000Z', shownTo: 'ann', protectsFolders: false };
    confirmed = new Set();
    version = '1';
    admins = new Set(['ann', 'bob']);
    holdsFails = false;
  });

  test('the admin shown the words is asked to confirm, on the home page, /admin and /admin/backup', async () => {
    for (const p of ['/', '/admin', '/admin/backup']) {
      const r = await run(p);
      expect(r.next).toBe(true);
      expect(notice(r)).toMatchObject({ mine: true, link: `/consent?scope=${SCOPE}&returnTo=${encodeURIComponent(p)}` });
      expect(notice(r)?.message).toMatch(/12 recovery words are the only way to open its shared folders again/);
    }
  });

  test('another admin sees it too, naming who was shown them, and is pointed to Admin → Backup', async () => {
    const n = notice(await run('/admin', 'bob'));
    expect(n).toMatchObject({ mine: false, link: '/admin/backup#shared-folders-key' });
    expect(n?.message).toMatch(/ann was shown them and has not confirmed/);
    // They can discard the unconfirmed set and make their own (operator, 2026-10-29) ...
    expect(n?.message).toMatch(/discard this set on Admin → Backup and make a new one, then confirm it yourself/);
    // ... but not one that protects folder keys: that one they replace with a new set (#2144).
    words.protectsFolders = true;
    const replace = notice(await run('/admin', 'bob'))?.message;
    expect(replace).not.toMatch(/discard/);
    expect(replace).toMatch(/make a new set on Admin → Backup and confirm it yourself/);
    // The admin shown them is never told to discard.
    words.protectsFolders = false;
    expect(notice(await run('/admin', 'ann'))?.message).not.toMatch(/discard/);
  });

  test('not for a user without admin-system, not on other pages, not for a delegated request, not before words exist', async () => {
    admins.delete('bob');
    expect(notice(await run('/admin', 'bob'))).toBeUndefined();
    expect(notice(await run('/profile'))).toBeUndefined();
    expect(notice(await run('/view/Main'))).toBeUndefined();
    expect(notice(await run('/admin', 'ann', { userContext: { username: 'ann', isAuthenticated: true, viaToken: { id: 't' } } }))).toBeUndefined();
    expect(notice(await run('/admin', 'ann', { method: 'POST' }))).toBeUndefined();
    words = null;
    expect(notice(await run('/admin'))).toBeUndefined();
  });

  test('clears once the admin shown the words confirms; another admin confirming does not clear it', async () => {
    confirmed.add('bob/org-words-1@1');
    expect(notice(await run('/admin'))).toBeDefined();
    confirmed.add('ann/org-words-1@1');
    expect(notice(await run('/admin'))).toBeUndefined();
    expect(notice(await run('/admin', 'bob'))).toBeUndefined();
  });

  test('a new version of the wording asks again', async () => {
    confirmed.add('ann/org-words-1@1');
    version = '2';
    expect(notice(await run('/admin'))).toBeDefined();
  });

  test('never blocks: an error shows no banner and the request goes on', async () => {
    holdsFails = true;
    const r = await run('/admin');
    expect(r.next).toBe(true);
    expect(notice(r)).toBeUndefined();
  });
});
