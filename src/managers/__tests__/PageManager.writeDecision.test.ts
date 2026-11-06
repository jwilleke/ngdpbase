/**
 * #1815 — PageManager decides writes: `savePage` and `deletePage` refuse what
 * the context may not do, whatever route or add-on called them.
 *
 * Run against the SHIPPED policies with a real PolicyEvaluator,
 * PolicyDecisionPoint and PolicyInformationPoint. Only the page store, the
 * account store and the proxy grant store are fakes. Roles appear below only
 * as what the shipped policies grant to; the door asks permissions.
 *
 * Operator decisions (2026-11-04) tested here: the check is the permission
 * through policy, the page's own rules and the vault container rule (1); the
 * boot vault upgrade is the owner's job and the system principal is let into
 * no vault (2, with PageManager.privateLinkMigration); a page the system
 * makes for a user is the system job's `page-create`, with the user as author
 * (3); the destination vault is read from the page's `private` / `store`
 * frontmatter (7). Decisions 4–6 are tested at their callers
 * (WikiRoutes.coverage7, WikiRoutes.pageDoor / coverage15,
 * UserManager.testAccountProfile).
 *
 * Sabotaged once each: the existing-page check removed (the reader edit and
 * the non-owner vault edit went red); the create check removed (the reader
 * create and the system-without-roles create went red); the destination read
 * from the name alone (the private:true rows went red); the delete check
 * removed (the reader delete went red).
 */
vi.unmock('../PageManager');

import fs from 'fs';
import path from 'path';
import PageManager, { PageWriteRefusedError, SHARED_CATEGORY_REFUSAL, SYSTEM_CATEGORY_ADMIN_ONLY } from '../PageManager';
import PolicyEvaluator from '../PolicyEvaluator';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import { jobContextForOwner, jobContextFromSystem } from '../../context/JobContext';
import { formatPrivatePageName, SHARED_FOLDER_OWNER } from '../../utils/privateStorePath';
import type { ProxyClaim } from '../UserManager';

const shipped = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')
) as Record<string, unknown>;

/** Each account's roles: what the shipped policies grant to. */
const ROLES: Record<string, string[]> = {
  rita: ['reader', 'vault-owner'],
  cora: ['contributor', 'vault-owner'],
  ed: ['editor', 'vault-owner'],
  alice: ['reader', 'vault-owner'],
  bob: ['admin', 'vault-owner'],
  mom: ['contributor', 'vault-owner'],
  jim: ['editor', 'vault-owner']
};

const request = (username: string) => ({ username, roles: ROLES[username], isAuthenticated: true, signIn: { at: 'fresh' } });
const ALICE_DIARY = formatPrivatePageName('alice', 'default', 'Diary');

type Stored = { content: string; metadata: Record<string, unknown> };

interface Grant { owner: string; proxy: string; permissions: string[] }

function makeSite({ systemRoles = ['admin'] }: { systemRoles?: string[] } = {}) {
  const pages = new Map<string, Stored>();
  const saved: Array<{ name: string; metadata: Record<string, unknown> }> = [];
  const deleted: string[] = [];
  const audit: Array<Record<string, unknown>> = [];
  const grants = new Map<string, Grant>();
  const trash = new Map<string, { name: string; metadata: Record<string, unknown> }>();
  const restored: string[] = [];

  const config: Record<string, unknown> = {
    ...shipped,
    'ngdpbase.system.principal': 'system',
    'ngdpbase.system.roles': systemRoles
  };
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: (key: string, def: unknown) => (key in config ? config[key] : def),
      getResolvedDataPath: (_key: string, def: string) => def
    },
    UserManager: { getUser: async (u: string) => (ROLES[u] ? { username: u, isActive: true, preferences: {} } : null) },
    RoleManager: { resolveUserRoles: async (_ctx: unknown, u: string) => ROLES[u] ?? [] },
    AuthManager: { stepUpNeeded: () => false, liveProxyGrant: (id: string) => grants.get(id) ?? null },
    AuditManager: {
      logAuditEvent: async (e: Record<string, unknown>) => { audit.push(e); return 'id'; },
      flushAuditQueue: async () => {}
    }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null } as never;

  const evaluator = new PolicyEvaluator(engine);
  managers.PolicyEvaluator = evaluator;
  managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
  const pip = new PolicyInformationPoint(engine);
  managers.PolicyInformationPoint = pip;

  const pageManager = new PageManager(engine);
  managers.PageManager = pageManager;
  const asPage = (name: string) => {
    const page = pages.get(name);
    return page ? { ...page, title: page.metadata.title, uuid: page.metadata.uuid } : null;
  };
  (pageManager as unknown as { provider: unknown }).provider = {
    getPage: async (name: string) => asPage(name),
    getPageMetadata: async (name: string) => pages.get(name)?.metadata ?? null,
    pageExists: (name: string) => pages.has(name),
    savePage: async (name: string, _content: string, metadata: Record<string, unknown>) => {
      saved.push({ name, metadata });
      return { name, uuid: (metadata.uuid as string | undefined) ?? `u-${name}` };
    },
    deletePage: async (name: string) => { deleted.push(name); return pages.delete(name); },
    // The trash: a uuid → where it goes back to and its frontmatter.
    deletedPageForRestore: async (uuid: string) => trash.get(uuid) ?? null,
    restoreDeletedPage: async (uuid: string) => {
      const t = trash.get(uuid);
      if (!t) return { ok: false, reason: 'not-found' };
      restored.push(uuid);
      return { ok: true, title: String(t.metadata.title) };
    }
  };

  const put = (name: string, metadata: Record<string, unknown> = {}) =>
    pages.set(name, { content: 'body', metadata: { title: name.split('/').pop(), uuid: `u-${name}`, 'system-category': 'general', ...metadata } });

  return {
    pageManager,
    saved,
    deleted,
    audit,
    grants,
    pages,
    trash,
    restored,
    put,
    config,
    ready: () => evaluator.initialize()
  };
}

const OPTS = { skipValidation: true, skipConflictCheck: true };

describe('PageManager write door (#1815)', () => {
  let site: ReturnType<typeof makeSite>;

  beforeEach(async () => {
    site = makeSite();
    await site.ready();
    site.put('Main', { author: 'ed' });
    site.put(ALICE_DIARY, { author: 'alice', private: true });
  });

  describe('the permission, through policy (decision 1)', () => {
    // Security review L1: a refused create is recorded like a refused edit or
    // delete. Sabotaged: with the recordCreateRefusal call removed from
    // assertMaySave, the page-create row was missing and this went red.
    test('a refused create is recorded as authorization-deny, with the actor', async () => {
      await expect(site.pageManager.savePage('Brand New', 'new', {}, request('rita') as never, OPTS))
        .rejects.toMatchObject({ action: 'page-create' });
      expect(site.audit.filter((e) => e.eventType === 'authorization-deny')).toEqual([
        expect.objectContaining({ user: 'rita', action: 'page-create', resource: 'Brand New', resourceType: 'page', result: 'deny', metadata: expect.objectContaining({ origin: 'request' }) })
      ]);
    });

    // #2272: the refusal names the policy that decided it, and is recorded once.
    test('a create refused by a deny policy is recorded once, with metadata.policyIds', async () => {
      site.config['ngdpbase.access.policies'] = [...(site.config['ngdpbase.access.policies'] as unknown[]), {
        id: 'verify-deny-page-writes', name: 'deny', description: 'deny', priority: 1, effect: 'deny',
        subjects: [{ type: 'role', value: 'contributor' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-create']
      }];
      await site.ready();
      await expect(site.pageManager.savePage('Brand New', 'new', {}, request('cora') as never, OPTS))
        .rejects.toMatchObject({ action: 'page-create' });
      const denials = site.audit.filter((e) => e.eventType === 'authorization-deny');
      expect(denials).toHaveLength(1);
      expect(denials[0]).toMatchObject({ action: 'page-create', metadata: { policyIds: ['verify-deny-page-writes'] } });
    });

    // #2272 (security review): a refusal no policy decided must not name one.
    // cora is allowed page-create (contributor-allow); createdFor is refused
    // for a non-system job, so the record must carry no policyIds.
    test('a createdFor refusal, which no policy decided, is recorded without policyIds', async () => {
      await expect(site.pageManager.savePage('Profile: Rita', 'hello', {}, request('cora') as never, { ...OPTS, createdFor: 'rita' }))
        .rejects.toMatchObject({ action: 'page-create' });
      const denials = site.audit.filter((e) => e.eventType === 'authorization-deny');
      expect(denials).toHaveLength(1);
      expect(denials[0]).toMatchObject({ reason: 'createdFor is for a system job only' });
      expect(denials[0].metadata).not.toHaveProperty('policyIds');
    });

    test('a reader may neither edit nor create a public page; nothing is written', async () => {
      await expect(site.pageManager.savePage('Main', 'new', {}, request('rita') as never, OPTS))
        .rejects.toMatchObject({ name: 'PageWriteRefusedError', action: 'page-edit' });
      await expect(site.pageManager.savePage('Brand New', 'new', {}, request('rita') as never, OPTS))
        .rejects.toMatchObject({ name: 'PageWriteRefusedError', action: 'page-create' });
      expect(site.saved).toEqual([]);
    });

    test('a contributor holds page-edit and page-create, so both are written', async () => {
      await site.pageManager.savePage('Main', 'new', {}, request('cora'), OPTS);
      await site.pageManager.savePage('Brand New', 'new', {}, request('cora'), OPTS);
      expect(site.saved.map((s) => s.name)).toEqual(['Main', 'Brand New']);
    });

    test('page-delete: a contributor is refused and nothing is deleted or recorded; an editor deletes, recorded first', async () => {
      await expect(site.pageManager.deletePage('Main', request('cora') as never)).rejects.toBeInstanceOf(PageWriteRefusedError);
      expect(site.deleted).toEqual([]);
      expect(site.audit.filter((e) => e.eventType === 'page-delete')).toEqual([]);

      expect(await site.pageManager.deletePage('Main', request('ed') as never)).toBe(true);
      expect(site.deleted).toEqual(['Main']);
      expect(site.audit.filter((e) => e.eventType === 'page-delete')).toEqual([
        expect.objectContaining({ user: 'ed', metadata: expect.objectContaining({ pageName: 'Main', outcome: 'attempted' }) })
      ]);
    });

    test('a delete the caller already recorded is not recorded twice', async () => {
      await site.pageManager.deletePage('Main', request('ed'), { audit: { skip: true } });
      expect(site.audit.filter((e) => e.eventType === 'page-delete')).toEqual([]);
    });

    test('a page that cannot be found is not deleted, and the provider is not asked', async () => {
      expect(await site.pageManager.deletePage('Nowhere', request('ed') as never)).toBe(false);
      expect(site.deleted).toEqual([]);
    });

    test('the affordance agrees with the door, and records nothing', async () => {
      expect(await site.pageManager.mayEditPage('Main', request('rita') as never)).toBe(false);
      expect(await site.pageManager.mayEditPage('Main', request('cora') as never)).toBe(true);
      expect(site.audit).toEqual([]);
    });
  });

  describe('the vault container rule', () => {
    test('the owner edits their vault page; anyone else is refused, an administrator included', async () => {
      await site.pageManager.savePage(ALICE_DIARY, 'new', { private: true }, request('alice'), OPTS);
      expect(site.saved.map((s) => s.name)).toEqual([ALICE_DIARY]);

      for (const who of ['ed', 'bob']) {
        await expect(site.pageManager.savePage(ALICE_DIARY, 'x', { private: true }, request(who) as never, OPTS))
          .rejects.toBeInstanceOf(PageWriteRefusedError);
        await expect(site.pageManager.deletePage(ALICE_DIARY, request(who) as never)).rejects.toBeInstanceOf(PageWriteRefusedError);
      }
      expect(site.saved).toHaveLength(1);
      expect(site.deleted).toEqual([]);
    });

    test('a new vault page: the owner creates it, someone else may not create in it', async () => {
      const note = formatPrivatePageName('alice', 'default', 'Note');
      await site.pageManager.savePage(note, 'new', {}, request('alice'), OPTS);
      await expect(site.pageManager.savePage(formatPrivatePageName('alice', 'default', 'Other'), 'x', {}, request('ed') as never, OPTS))
        .rejects.toMatchObject({ action: 'page-create' });
      expect(site.saved.map((s) => s.name)).toEqual([note]);
    });
  });

  describe('the destination vault, from the page\'s own frontmatter (decision 7)', () => {
    test('a public title saved private: true is decided in the creator\'s vault, where a reader may create', async () => {
      // Alice may not create a public page …
      await expect(site.pageManager.savePage('Journal Entry', 'x', {}, request('alice') as never, OPTS))
        .rejects.toMatchObject({ action: 'page-create' });
      // … but the same title, private, is a page in her own vault, and vault-owner lets her.
      await site.pageManager.savePage('Journal Entry', 'x', { private: true, store: 'journal' }, request('alice'), OPTS);
      expect(site.saved.map((s) => s.name)).toEqual(['Journal Entry']);
    });

    test('an existing public page moved into a vault is also a create there: an editor without vault-owner may not', async () => {
      ROLES.edna = ['editor'];
      try {
        site.put('Shared Notes', { author: 'edna' });
        await expect(site.pageManager.savePage('Shared Notes', 'x', { private: true }, request('edna') as never, OPTS))
          .rejects.toMatchObject({ action: 'page-create' });
        // An edit that stays public is hers to make.
        await site.pageManager.savePage('Shared Notes', 'x', {}, request('edna'), OPTS);
        expect(site.saved.map((s) => s.name)).toEqual(['Shared Notes']);
      } finally {
        delete ROLES.edna;
      }
    });
  });

  describe('a proxy, within and beyond its grant', () => {
    const claim = (scopes: string[]): ProxyClaim => ({ kind: 'proxy', grantId: 'g1', actor: 'jim', scopes } as ProxyClaim);
    const forMom = (scopes: string[]) => ({ ...request('mom'), viaProxy: claim(scopes) });

    beforeEach(() => {
      site.grants.set('g1', { owner: 'mom', proxy: 'jim', permissions: ['page-read', 'page-edit', 'vault-proxy'] });
    });

    test('an edit the grant carries, that mom and jim both hold, is written', async () => {
      await site.pageManager.savePage('Main', 'new', {}, forMom(['page-read', 'page-edit']), OPTS);
      expect(site.saved.map((s) => s.name)).toEqual(['Main']);
    });

    test('a delete the grant does not carry is refused, though jim holds page-delete', async () => {
      await expect(site.pageManager.deletePage('Main', forMom(['page-read', 'page-edit']) as never)).rejects.toBeInstanceOf(PageWriteRefusedError);
      expect(site.deleted).toEqual([]);
    });

    test('the grant revoked: the edit it carried is refused', async () => {
      site.grants.delete('g1');
      await expect(site.pageManager.savePage('Main', 'new', {}, forMom(['page-read', 'page-edit']) as never, OPTS))
        .rejects.toBeInstanceOf(PageWriteRefusedError);
    });
  });

  describe('system and job contexts, only by the policy that grants them', () => {
    const SYSTEM = jobContextFromSystem('system', 'a test of the system job');

    test('the system job creates and edits public pages by the roles policy gives it', async () => {
      await site.pageManager.savePage('Main', 'new', {}, SYSTEM, OPTS);
      await site.pageManager.savePage('Seeded', 'new', {}, SYSTEM, OPTS);
      expect(site.saved.map((s) => s.name)).toEqual(['Main', 'Seeded']);
    });

    test('the system job with no roles in policy writes nothing — no "system skips the check"', async () => {
      const bare = makeSite({ systemRoles: [] });
      await bare.ready();
      bare.put('Main', { author: 'ed' });
      await expect(bare.pageManager.savePage('Main', 'new', {}, SYSTEM, OPTS)).rejects.toBeInstanceOf(PageWriteRefusedError);
      await expect(bare.pageManager.savePage('Seeded', 'new', {}, SYSTEM, OPTS)).rejects.toBeInstanceOf(PageWriteRefusedError);
      expect(bare.saved).toEqual([]);
    });

    test('the system principal is let into no vault (decision 2)', async () => {
      await expect(site.pageManager.savePage(ALICE_DIARY, 'x', { private: true }, SYSTEM, OPTS)).rejects.toBeInstanceOf(PageWriteRefusedError);
    });

    test('a job on the owner\'s behalf writes in their vault with their rights; one for someone else does not (decision 2)', async () => {
      await site.pageManager.savePage(ALICE_DIARY, 'x', { private: true }, jobContextForOwner('alice', 'vault upgrade'), OPTS);
      await expect(site.pageManager.savePage(ALICE_DIARY, 'x', { private: true }, jobContextForOwner('ed', 'vault upgrade'), OPTS))
        .rejects.toBeInstanceOf(PageWriteRefusedError);
      expect(site.saved.map((s) => s.name)).toEqual([ALICE_DIARY]);
    });
  });

  describe('a page the system makes for a user (decision 3)', () => {
    const SYSTEM = jobContextFromSystem('system', 'create a profile page');

    test('made by the system job, authored and edited as the user it is for', async () => {
      await site.pageManager.savePage('Profile: Rita', 'hello', { 'author-lock': true }, SYSTEM, { ...OPTS, createdFor: 'rita' });
      expect(site.saved[0].metadata).toMatchObject({ author: 'rita', editor: 'rita' });
    });

    test('createdFor from any other context is refused, before anything is written, and recorded', async () => {
      await expect(site.pageManager.savePage('Profile: Rita', 'hello', {}, request('ed') as never, { ...OPTS, createdFor: 'rita' }))
        .rejects.toMatchObject({ name: 'PageWriteRefusedError', action: 'page-create' });
      await expect(site.pageManager.savePage('Profile: Rita', 'hello', {}, jobContextForOwner('ed', 'not the system'), { ...OPTS, createdFor: 'rita' }))
        .rejects.toMatchObject({ name: 'PageWriteRefusedError', action: 'page-create' });
      expect(site.saved).toEqual([]);
      expect(site.audit.filter((e) => e.eventType === 'authorization-deny')).toEqual([
        expect.objectContaining({ user: 'ed', action: 'page-create', resource: 'Profile: Rita', reason: 'createdFor is for a system job only' }),
        expect.objectContaining({ action: 'page-create', resource: 'Profile: Rita', reason: 'createdFor is for a system job only' })
      ]);
    });

    // Security review M2: a profile rename's new name is checked with
    // pageExists as the user, who may not see a page that is there (an
    // audience leaving them out, or the page list mid-rebuild). The system
    // job's save must then be refused — never an edit of that page with the
    // job's admin rights. Sabotaged: with `|| existingPage` taken out of the
    // createdFor check, the save went through as an edit and this went red.
    test('createdFor naming a page that exists — one the user cannot see — is refused; that page is unchanged', async () => {
      site.put('Board Minutes', { author: 'ed', audience: ['editor'], 'author-lock': true });
      const before = JSON.stringify(site.pages.get('Board Minutes'));
      await expect(site.pageManager.savePage('Board Minutes', 'my profile', { title: 'Board Minutes', 'system-category': 'user-profile' }, SYSTEM, { ...OPTS, createdFor: 'rita' }))
        .rejects.toMatchObject({ name: 'PageWriteRefusedError', action: 'page-create' });
      expect(site.saved).toEqual([]);
      expect(JSON.stringify(site.pages.get('Board Minutes'))).toBe(before);
      expect(site.audit.filter((e) => e.eventType === 'authorization-deny')).toEqual([
        expect.objectContaining({ action: 'page-create', resource: 'Board Minutes', reason: 'createdFor names a page that already exists' })
      ]);
    });

    test('the new user alone could not have made it: they hold no page-create', async () => {
      await expect(site.pageManager.savePage('Profile: Rita', 'hello', {}, request('rita') as never, OPTS))
        .rejects.toMatchObject({ action: 'page-create' });
    });
  });

  // Security review L5: a page back from the trash is created again where it
  // was, so the door decides page-create there, whoever called. Sabotaged:
  // with the check in restoreDeletedPage removed, the reader's restore and
  // the vault restore went through and this went red.
  describe('a page restored from the trash', () => {
    beforeEach(() => {
      site.trash.set('u-old', { name: 'Old Page', metadata: { title: 'Old Page', uuid: 'u-old', 'system-category': 'general' } });
      site.trash.set('u-diary', { name: formatPrivatePageName('alice', 'default', 'Old Diary'), metadata: { title: 'Old Diary', uuid: 'u-diary', private: true } });
    });

    test('someone who may not create the page there may not restore it; nothing is restored, the refusal recorded', async () => {
      await expect(site.pageManager.restoreDeletedPage('u-old', request('rita') as never))
        .rejects.toMatchObject({ name: 'PageWriteRefusedError', action: 'page-create' });
      expect(site.restored).toEqual([]);
      expect(site.audit.filter((e) => e.eventType === 'authorization-deny')).toEqual([
        expect.objectContaining({ user: 'rita', action: 'page-create', resource: 'Old Page' })
      ]);
    });

    test('a vault page goes back only by its owner; an administrator is refused', async () => {
      await expect(site.pageManager.restoreDeletedPage('u-diary', request('bob') as never)).rejects.toBeInstanceOf(PageWriteRefusedError);
      expect(site.restored).toEqual([]);
      expect(await site.pageManager.restoreDeletedPage('u-diary', request('alice'))).toMatchObject({ ok: true });
      expect(site.restored).toEqual(['u-diary']);
    });

    test('an administrator restores a public page', async () => {
      expect(await site.pageManager.restoreDeletedPage('u-old', request('bob'))).toMatchObject({ ok: true, title: 'Old Page' });
      expect(site.restored).toEqual(['u-old']);
    });
  });
});

describe('PageManager write door by system-category (#2255)', () => {
  let site: ReturnType<typeof makeSite>;
  const SHARED_NOTES = formatPrivatePageName(SHARED_FOLDER_OWNER, 'default', 'Notes');

  beforeEach(async () => {
    site = makeSite();
    await site.ready();
    site.put('Main', { author: 'ed' });
    site.put('Install Guide', { author: 'system', 'system-category': 'documentation' });
  });

  test('an editor edits a general page but not a documentation page; an admin edits both', async () => {
    await site.pageManager.savePage('Main', 'new', {}, request('ed'), OPTS);
    await expect(site.pageManager.savePage('Install Guide', 'new', {}, request('ed') as never, OPTS))
      .rejects.toMatchObject({ name: 'PageWriteRefusedError', action: 'page-edit' });
    await site.pageManager.savePage('Install Guide', 'new', {}, request('bob'), OPTS);
    expect(site.saved.map((s) => s.name)).toEqual(['Main', 'Install Guide']);
  });

  test('a refused edit is recorded with the policies that decided it', async () => {
    site.config['ngdpbase.access.policies'] = [
      ...(site.config['ngdpbase.access.policies'] as unknown[]),
      { id: 'freeze-main', effect: 'deny', priority: 1, subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'page', pattern: 'Main' }], actions: ['page-edit'] }
    ];
    await expect(site.pageManager.savePage('Main', 'new', {}, request('ed') as never, OPTS)).rejects.toBeInstanceOf(PageWriteRefusedError);
    expect(site.audit.filter((e) => e.eventType === 'authorization-deny')).toEqual([
      expect.objectContaining({ user: 'ed', action: 'edit', resource: 'Main', metadata: expect.objectContaining({ policyIds: ['freeze-main'] }) })
    ]);
  });

  test('a save that changes the title is a rename too: a contributor may edit but not rename', async () => {
    await site.pageManager.savePage('Main', 'new', { title: 'Main' }, request('cora'), OPTS);
    await expect(site.pageManager.savePage('Main', 'new', { title: 'Main Two' }, request('cora') as never, OPTS))
      .rejects.toMatchObject({ action: 'page-rename' });
    await site.pageManager.savePage('Main', 'new', { title: 'Main Two' }, request('ed'), OPTS);
  });

  test('a page created in a shared folder gets the shared category, whatever the save asks', async () => {
    await site.pageManager.savePage(SHARED_NOTES, 'new', { 'system-category': 'general' }, request('rita'), OPTS);
    expect(site.saved.at(-1)?.metadata['system-category']).toBe('shared');
  });

  test('no other save may give a page the shared category, an admin\'s included', async () => {
    await expect(site.pageManager.savePage('Main', 'new', { 'system-category': 'shared' }, request('bob') as never, OPTS))
      .rejects.toThrow(SHARED_CATEGORY_REFUSAL);
    await expect(site.pageManager.savePage('Fresh', 'new', { 'system-category': 'shared' }, request('bob') as never, OPTS))
      .rejects.toThrow(SHARED_CATEGORY_REFUSAL);
  });

  test('setting a system-category needs page-categorize (admin); nobody may ask for shared', async () => {
    expect(await site.pageManager.systemCategoryForWrite(request('ed') as never, 'documentation', 'general')).toEqual({ ok: false, reason: SYSTEM_CATEGORY_ADMIN_ONLY });
    expect(await site.pageManager.systemCategoryForWrite(request('ed') as never, 'general', 'general')).toMatchObject({ ok: true, category: 'general' });
    expect(await site.pageManager.systemCategoryForWrite(request('bob') as never, 'documentation', 'general')).toMatchObject({ ok: true, category: 'documentation', admin: true });
    expect(await site.pageManager.systemCategoryForWrite(request('bob') as never, 'shared', 'general')).toEqual({ ok: false, reason: SHARED_CATEGORY_REFUSAL });
  });
});
