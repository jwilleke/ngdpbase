/**
 * ConsentManager (#1603): versioned acceptance of the site's terms and of
 * add-ons' documents, recorded first in the audit log, stored append-only.
 *
 * The records are a real FileConsentProvider in a per-test mkdtemp folder,
 * removed afterwards (never a data/ tree). Pages, accounts, the PDP and the
 * audit sink are stand-ins.
 *
 * Sabotaged once each (then restored):
 * - the version comparison in pendingFor (matched on document only): the
 *   "version change asks again" test went red;
 * - the viaProxy refusal (removed): the proxy test went red;
 * - recording before storing (store first, then record): the refuse-on-failure
 *   test went red, a record was left on disk;
 * - the seen check (skipped): the changed-version test went red;
 * - the `<slug>-` prefix rule (skipped): the add-on registration test went red;
 * - the account binding in recordsOf (removed): the reused-username test went red.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ConsentManager, { ConsentChangedError, ConsentRefusedError } from '../ConsentManager';
import type { ConsentDocument } from '../../types/Consent';
import { isJobContext } from '../../context/ActorContext';

interface Subj { username: string; isAuthenticated: boolean; roles: string[]; ipAddress?: string; viaProxy?: unknown; viaToken?: unknown; viaShare?: unknown }
const person = (username: string, over: Partial<Subj> = {}): never =>
  ({ username, roles: ['reader'], isAuthenticated: true, ipAddress: '192.0.2.10', ...over }) as never;

describe('ConsentManager (#1603)', () => {
  let dir: string;
  let pages: Record<string, Record<string, unknown> | null>;
  let users: Record<string, { username: string; createdAt?: string; isActive?: boolean }>;
  let holdsProfileManage: Set<string>;
  let audited: Array<Record<string, unknown>>;
  let auditFails: boolean;
  let perPerson: Set<string>;
  let cm: ConsentManager;

  const seenOf = (docs: ConsentDocument[]): Array<{ id: string; version: string }> => docs.map((d) => ({ id: d.id, version: d.version }));

  const build = async (): Promise<ConsentManager> => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (_k: string, d: unknown) => d,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.consent.storagedir' ? dir : d)
      },
      PageManager: { getPageMetadata: (id: string) => Promise.resolve(pages[id] ?? null) },
      UserManager: { getUser: (u: string) => Promise.resolve(users[u]) },
      // The PDP takes the caller's context, a job's included, and converts it itself (#2022).
      PolicyDecisionPoint: { permits: (s: Subj, a: string) => Promise.resolve(a === 'profile-manage' && (isJobContext(s as never) || s.isAuthenticated) && holdsProfileManage.has(s.username)) },
      AddonsManager: { isPerPerson: (slug: string) => perPerson.has(slug) },
      AuditManager: {
        logAuditEvent: (e: Record<string, unknown>) => {
          if (auditFails) return Promise.reject(new Error('audit device full'));
          audited.push(e);
          return Promise.resolve('evt');
        },
        flushAuditQueue: () => Promise.resolve()
      }
    };
    const manager = new ConsentManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'consent-1603-'));
    pages = {
      'terms-of-service': { title: 'Terms of Service', version: 1, effective: new Date('2026-10-22T00:00:00Z') },
      'privacy-policy': { title: 'Privacy Policy', version: '1', effective: '2026-10-22' },
      'recovery-words': { title: 'Your Recovery Words', version: 1, effective: '2026-10-29' },
      'shared-folders-recovery-words': { title: 'Shared Folders Recovery Words', version: 1, effective: '2026-10-29' },
      'remember-browser': { title: 'Remember This Browser', version: 1, effective: '2026-11-01' }
    };
    users = { ann: { username: 'ann', createdAt: '2026-01-01T00:00:00.000Z' }, bob: { username: 'bob' } };
    holdsProfileManage = new Set(['ann', 'bob']);
    audited = [];
    auditFails = false;
    perPerson = new Set(['phr']);
    cm = await build();
  });

  afterEach(() => {
    // Only this test's own mkdtemp folder.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('versioning', () => {
    test('a person with no records is asked for every document, at its current version and date', async () => {
      const pending = await cm.pendingFor('ann');
      expect(pending.map((d) => [d.id, d.version, d.effective])).toEqual([
        ['terms-of-service', '1', '2026-10-22'],
        ['privacy-policy', '1', '2026-10-22']
      ]);
    });

    test('accepting records each document, and then nothing is pending', async () => {
      const written = await cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in');
      expect(written.map((r) => [r.document, r.version, r.effective, r.context.by, r.context.how, r.context.ipAddress])).toEqual([
        ['terms-of-service', '1', '2026-10-22', 'ann', 'sign-in', '192.0.2.10'],
        ['privacy-policy', '1', '2026-10-22', 'ann', 'sign-in', '192.0.2.10']
      ]);
      expect(written.every((r) => typeof r.acceptedAt === 'string' && r.account === '2026-01-01T00:00:00.000Z')).toBe(true);
      expect(await cm.pendingFor('ann')).toEqual([]);
    });

    test('a version change asks again (the acceptance flag clears), only for the document that changed', async () => {
      await cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in');
      pages['terms-of-service'] = { ...pages['terms-of-service'], version: 2 };
      expect((await cm.pendingFor('ann')).map((d) => [d.id, d.version])).toEqual([['terms-of-service', '2']]);
      const status = await cm.statusFor(person('ann'));
      const tos = status[0].statuses.find((s) => s.document.id === 'terms-of-service')!;
      expect(tos.current).toBeNull();
      expect(tos.latest?.version).toBe('1');
    });

    test('an ordinary edit (same version) asks nothing', async () => {
      await cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in');
      pages['terms-of-service'] = { ...pages['terms-of-service'], title: 'Terms of Service (typo fixed)' };
      expect(await cm.pendingFor('ann')).toEqual([]);
    });

    test('the file is append-only: a re-acceptance adds lines and keeps the old ones', async () => {
      await cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-up');
      pages['terms-of-service'] = { ...pages['terms-of-service'], version: 2 };
      await cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in');
      const lines = fs.readFileSync(path.join(dir, 'ann.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { document: string; version: string });
      expect(lines.map((l) => `${l.document}@${l.version}`)).toEqual(['terms-of-service@1', 'privacy-policy@1', 'terms-of-service@2']);
    });

    test('the record file is owner-only', async () => {
      if (process.platform === 'win32') return;
      await cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in');
      expect(fs.statSync(path.join(dir, 'ann.jsonl')).mode & 0o777).toBe(0o600);
      expect(fs.statSync(dir).mode & 0o077).toBe(0);
    });

    test('a version the person was not shown is refused, and nothing is recorded', async () => {
      const shown = seenOf(await cm.pendingFor('ann'));
      pages['terms-of-service'] = { ...pages['terms-of-service'], version: 2 };
      await expect(cm.accept(person('ann'), 'core', shown, 'sign-in')).rejects.toBeInstanceOf(ConsentChangedError);
      expect(audited).toHaveLength(0);
      expect(fs.existsSync(path.join(dir, 'ann.jsonl'))).toBe(false);
    });

    test('a record made on an earlier account of the same name is never the new account\'s', async () => {
      await cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in');
      users.ann = { username: 'ann', createdAt: '2026-09-09T00:00:00.000Z' };
      expect(await cm.pendingFor('ann')).toHaveLength(2);
    });
  });

  describe('audit', () => {
    test('each acceptance is recorded as consent-grant with who, the document, version and how', async () => {
      await cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in');
      expect(audited).toHaveLength(2);
      expect(audited[0]).toMatchObject({
        eventType: 'consent-grant', user: 'ann', ipAddress: '192.0.2.10', result: 'success',
        resource: 'terms-of-service', resourceType: 'consent-document',
        metadata: { origin: 'request', scope: 'core', version: '1', effective: '2026-10-22', how: 'sign-in' }
      });
    });

    test('on-failure refuse: a failed audit record refuses the acceptance, and nothing is stored', async () => {
      auditFails = true;
      await expect(cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in')).rejects.toThrow();
      expect(fs.existsSync(path.join(dir, 'ann.jsonl'))).toBe(false);
      auditFails = false;
      expect(await cm.pendingFor('ann')).toHaveLength(2);
    });

    test('deleting the account records consent-withdraw, then removes the records', async () => {
      await cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in');
      await cm.removeAccount('ann', person('admin'));
      const withdraw = audited.find((e) => e.eventType === 'consent-withdraw');
      expect(withdraw).toMatchObject({ user: 'admin', resource: 'ann', reason: 'account-deleted' });
      expect((withdraw.metadata as { accepted: unknown[] }).accepted).toHaveLength(2);
      expect(fs.existsSync(path.join(dir, 'ann.jsonl'))).toBe(false);
    });

    test('a withdraw that cannot be recorded keeps the records (on-failure refuse)', async () => {
      await cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in');
      auditFails = true;
      await expect(cm.removeAccount('ann', person('admin'))).rejects.toThrow();
      expect(fs.existsSync(path.join(dir, 'ann.jsonl'))).toBe(true);
    });
  });

  describe('who may accept', () => {
    test.each([
      ['a proxy acting for the person', { viaProxy: { grantId: 'g1', actor: 'jim' } }],
      ['an agent token', { viaToken: { id: 't1', name: 'bot', scopes: ['page-read'] } }],
      ['a share link', { viaShare: { id: 's1' } }],
      ['an anonymous visitor', { isAuthenticated: false }]
    ])('%s is refused, and nothing is recorded', async (_label, over) => {
      await expect(cm.accept(person('ann', over as Partial<Subj>), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in'))
        .rejects.toBeInstanceOf(ConsentRefusedError);
      expect(audited).toHaveLength(0);
      expect(await cm.pendingFor('ann')).toHaveLength(2);
    });

    test('someone without profile-manage is refused', async () => {
      holdsProfileManage.delete('ann');
      await expect(cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in')).rejects.toBeInstanceOf(ConsentRefusedError);
    });

    test('there is no account to accept for: refused', async () => {
      holdsProfileManage.add('ghost');
      await expect(cm.accept(person('ghost'), 'core', [], 'sign-in')).rejects.toBeInstanceOf(ConsentRefusedError);
    });

    test('a sign-up acceptance is a request-origin job context for the new account', async () => {
      const ctx = { username: 'bob', origin: 'request', ipAddress: '192.0.2.20', requestedAt: new Date().toISOString(), reason: 'accepted the terms at sign-up' };
      const written = await cm.accept(ctx, 'core', seenOf(await cm.pendingFor('bob')), 'sign-up');
      expect(written.map((r) => r.context.how)).toEqual(['sign-up', 'sign-up']);
      expect(audited[0]).toMatchObject({ user: 'bob', metadata: { origin: 'request', reason: 'accepted the terms at sign-up' } });
    });

    test('a job that is not a request (boot, schedule) is refused', async () => {
      const ctx = { username: 'bob', origin: 'boot', requestedAt: new Date().toISOString(), reason: 'x' };
      await expect(cm.accept(ctx as never, 'core', seenOf(await cm.pendingFor('bob')), 'sign-up')).rejects.toBeInstanceOf(ConsentRefusedError);
    });
  });

  describe('no terms page', () => {
    test('a missing page asks nothing and blocks nothing, and needs attention until it is back', async () => {
      pages['terms-of-service'] = null;
      expect((await cm.pendingFor('ann')).map((d) => d.id)).toEqual(['privacy-policy']);
      expect(cm.getManagerStatus()).toMatchObject({ state: 'degraded', kind: 'attention' });
      expect(cm.getManagerStatus().reason).toMatch(/No 'terms-of-service' page/);

      pages['privacy-policy'] = null;
      expect(await cm.pendingFor('ann')).toEqual([]);

      pages['terms-of-service'] = { title: 'Terms of Service', version: 1 };
      pages['privacy-policy'] = { title: 'Privacy Policy', version: 1 };
      await cm.checkDocuments();
      expect(cm.getManagerStatus().state).toBe('ready');
    });

    test('a page with no version: is not asked for, and needs attention', async () => {
      pages['privacy-policy'] = { title: 'Privacy Policy' };
      expect((await cm.pendingFor('ann')).map((d) => d.id)).toEqual(['terms-of-service']);
      expect(cm.getManagerStatus().reason).toMatch(/'privacy-policy' page has no version/);
    });
  });

  describe('add-ons', () => {
    beforeEach(() => {
      pages['phr-terms-of-service'] = { title: 'PHR Terms', version: 3, effective: '2026-10-01' };
    });

    test('an add-on registers its own documents, asked separately from core\'s', async () => {
      cm.registerAddonDocuments('phr', { documents: ['phr-terms-of-service'], paths: ['/phr/'] });
      expect(cm.registeredAddons()).toEqual(['phr']);
      await cm.accept(person('ann'), 'core', seenOf(await cm.pendingFor('ann')), 'sign-in');
      expect((await cm.pendingFor('ann', 'phr')).map((d) => [d.id, d.version])).toEqual([['phr-terms-of-service', '3']]);
      await cm.accept(person('ann'), 'phr', [{ id: 'phr-terms-of-service', version: '3' }], 'add-on');
      expect(await cm.pendingFor('ann', 'phr')).toEqual([]);
      pages['phr-terms-of-service'] = { ...pages['phr-terms-of-service'], version: 4 };
      expect(await cm.pendingFor('ann', 'phr')).toHaveLength(1);
      expect(await cm.pendingFor('ann')).toEqual([]);
    });

    test('its paths say where it is used', () => {
      cm.registerAddonDocuments('phr', { documents: ['phr-terms-of-service'], paths: ['/phr/', 'api/phr'] });
      expect(cm.addonForPath('/phr')).toBe('phr');
      expect(cm.addonForPath('/phr/records')).toBe('phr');
      expect(cm.addonForPath('/api/phr/x')).toBe('phr');
      expect(cm.addonForPath('/phrase')).toBeNull();
      expect(cm.allDocumentIds()).toEqual(['terms-of-service', 'privacy-policy', 'recovery-words', 'shared-folders-recovery-words', 'remember-browser', 'phr-terms-of-service']);
    });

    test('an add-on may register only documents named <slug>-…, and only when it is per-person', () => {
      expect(() => cm.registerAddonDocuments('phr', { documents: ['terms-of-service'] })).toThrow(/only documents named 'phr-/);
      expect(() => cm.registerAddonDocuments('phr', { documents: ['ledger-terms-of-service'] })).toThrow(/only documents named 'phr-/);
      expect(() => cm.registerAddonDocuments('phr', { documents: [] })).toThrow(/no documents/);
      expect(() => cm.registerAddonDocuments('ledger', { documents: ['ledger-terms'] })).toThrow(/not per-person/);
    });
  });

  describe('the recovery words (#1928)', () => {
    const WORDS = 'words-set-1';

    test('a confirmation is recorded with who, when, how, the wording\'s version and which set of words, and is audited first', async () => {
      expect((await cm.pendingFor('ann', 'recovery-words', WORDS)).map((d) => [d.id, d.version])).toEqual([['recovery-words', '1']]);
      const [record, ...more] = await cm.accept(person('ann'), 'recovery-words', [{ id: 'recovery-words', version: '1' }], 'store-door', WORDS);
      expect(more).toEqual([]);
      expect(record).toMatchObject({
        kind: 'accept', document: 'recovery-words', scope: 'recovery-words', version: '1', effective: '2026-10-29',
        subject: WORDS, account: '2026-01-01T00:00:00.000Z',
        context: { by: 'ann', how: 'store-door', origin: 'request', ipAddress: '192.0.2.10' }
      });
      expect(Number.isNaN(Date.parse(record.acceptedAt))).toBe(false);
      expect(audited).toEqual([expect.objectContaining({ eventType: 'consent-grant', resource: 'recovery-words', metadata: expect.objectContaining({ scope: 'recovery-words', version: '1', how: 'store-door', subject: WORDS }) })]);
      expect(await cm.pendingFor('ann', 'recovery-words', WORDS)).toEqual([]);
    });

    test('a changed wording version asks again, and so does a new set of words', async () => {
      await cm.accept(person('ann'), 'recovery-words', [{ id: 'recovery-words', version: '1' }], 'store-door', WORDS);
      expect(await cm.pendingFor('ann', 'recovery-words', 'words-set-2')).toHaveLength(1);
      pages['recovery-words'] = { ...pages['recovery-words'], version: 2 };
      expect((await cm.pendingFor('ann', 'recovery-words', WORDS)).map((d) => d.version)).toEqual(['2']);
      await expect(cm.accept(person('ann'), 'recovery-words', [{ id: 'recovery-words', version: '1' }], 'reminder', WORDS)).rejects.toBeInstanceOf(ConsentChangedError);
      await cm.accept(person('ann'), 'recovery-words', [{ id: 'recovery-words', version: '2' }], 'reminder', WORDS);
      expect(await cm.pendingFor('ann', 'recovery-words', WORDS)).toEqual([]);
    });

    test('with no set of words there is nothing to ask, and nothing can be recorded', async () => {
      expect(await cm.pendingFor('ann', 'recovery-words')).toEqual([]);
      await expect(cm.accept(person('ann'), 'recovery-words', [{ id: 'recovery-words', version: '1' }], 'reminder')).rejects.toBeInstanceOf(ConsentRefusedError);
      expect(audited).toEqual([]);
    });

    test('it is never core\'s terms: confirming asks nothing of core, and core\'s terms ask nothing of it', async () => {
      await cm.accept(person('ann'), 'recovery-words', [{ id: 'recovery-words', version: '1' }], 'store-door', WORDS);
      expect((await cm.pendingFor('ann')).map((d) => d.id)).toEqual(['terms-of-service', 'privacy-policy']);
      expect((await cm.statusFor(person('ann'))).map((s) => s.scope)).toEqual(['core']);
    });

    test('a proxy cannot confirm for the user represented', async () => {
      await expect(cm.accept(person('ann', { viaProxy: { grantId: 'g' } }), 'recovery-words', [{ id: 'recovery-words', version: '1' }], 'reminder', WORDS)).rejects.toBeInstanceOf(ConsentRefusedError);
    });

    test('a missing page asks nothing and needs attention', async () => {
      pages['recovery-words'] = null;
      expect(await cm.pendingFor('ann', 'recovery-words', WORDS)).toEqual([]);
      expect(cm.getManagerStatus().reason).toMatch(/No 'recovery-words' page/);
    });

    test('no add-on may take its scope', () => {
      perPerson.add('recovery-words');
      expect(() => cm.registerAddonDocuments('recovery-words', { documents: ['recovery-words-x'] })).toThrow(/core keeps for itself/);
    });
  });

  describe('the shared folders\' recovery words (#2124)', () => {
    const SCOPE = 'shared-folders-recovery-words';
    const ORG_WORDS = 'org-words-set-1';

    test('a scope of its own, bound to the set of words, with its own document', async () => {
      expect(await cm.pendingFor('ann', SCOPE)).toEqual([]);
      expect((await cm.pendingFor('ann', SCOPE, ORG_WORDS)).map((d) => [d.id, d.version])).toEqual([[SCOPE, '1']]);
      const [record] = await cm.accept(person('ann'), SCOPE, [{ id: SCOPE, version: '1' }], 'setup', ORG_WORDS);
      expect(record).toMatchObject({ document: SCOPE, scope: SCOPE, version: '1', subject: ORG_WORDS, context: { by: 'ann', how: 'setup' } });
      expect(audited).toEqual([expect.objectContaining({ eventType: 'consent-grant', resource: SCOPE, metadata: expect.objectContaining({ scope: SCOPE, how: 'setup', subject: ORG_WORDS }) })]);
      expect(await cm.pendingFor('ann', SCOPE, ORG_WORDS)).toEqual([]);
      // A new set of words, or a new version of the wording, asks again; the personal words are a separate scope.
      expect(await cm.pendingFor('ann', SCOPE, 'org-words-set-2')).toHaveLength(1);
      expect(await cm.pendingFor('ann', 'recovery-words', ORG_WORDS)).toHaveLength(1);
      pages[SCOPE] = { ...pages[SCOPE], version: 2 };
      expect((await cm.pendingFor('ann', SCOPE, ORG_WORDS)).map((d) => d.version)).toEqual(['2']);
    });

    test('refused without a subject, and no add-on may take its scope', async () => {
      await expect(cm.accept(person('ann'), SCOPE, [{ id: SCOPE, version: '1' }], 'reminder')).rejects.toBeInstanceOf(ConsentRefusedError);
      perPerson.add(SCOPE);
      expect(() => cm.registerAddonDocuments(SCOPE, { documents: [`${SCOPE}-x`] })).toThrow(/core keeps for itself/);
    });

    test('a missing page asks nothing and needs attention', async () => {
      pages[SCOPE] = null;
      expect(await cm.pendingFor('ann', SCOPE, ORG_WORDS)).toEqual([]);
      expect(cm.getManagerStatus().reason).toMatch(/No 'shared-folders-recovery-words' page/);
    });
  });

  test('its records folder is declared for backup', () => {
    expect(cm.backupFolders()).toEqual([{ part: 'consent', folder: dir, optional: true }]);
  });
});
