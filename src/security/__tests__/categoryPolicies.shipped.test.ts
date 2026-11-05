/**
 * Who may change a page is its system-category's policies' to say (#2255).
 *
 * Run against the SHIPPED policies (core plus the journal add-on), a real
 * PolicyEvaluator, PolicyDecisionPoint and PolicyInformationPoint. The page
 * door is asked with only the page's name and frontmatter: the PDP asks the
 * PIP for the page's category and owner, as no route passes them any more.
 */

import fs from 'fs';
import path from 'path';
import PolicyInformationPoint from '../PolicyInformationPoint';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import { formatPrivatePageName, parsePrivatePageName, SHARED_FOLDER_OWNER } from '../../utils/privateStorePath';
import { mayEnterVaultAtDoor } from '../../utils/privateStoreAccess';
import type { ActorContext } from '../../context/ActorContext';
import type { Policy } from '../../types/Policy';
import { pageWritePoliciesToReview } from '../../utils/pageWritePolicies';

const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../../', rel), 'utf8')) as Record<string, unknown>;
const core = read('config/app-default-config.json');
const journal = read('addons/journal/config/default-config.json');
const shipped: Record<string, unknown> = {
  ...core,
  'ngdpbase.access.policies': [...(core['ngdpbase.access.policies'] as unknown[]), ...(journal['ngdpbase.access.policies'] as unknown[])],
  'ngdpbase.system-category': { ...(core['ngdpbase.system-category'] as object), ...(journal['ngdpbase.system-category'] as object) }
};

const user = (username: string, roles: string[]) => ({ username, roles, isAuthenticated: true });
const editor = user('erin', ['editor', 'vault-owner']);
const contributor = user('carl', ['contributor', 'vault-owner']);
const admin = user('ada', ['admin', 'vault-owner']);
const meta = (category: string | undefined, author = 'system', extra: Record<string, unknown> = {}) =>
  ({ title: 'P', uuid: 'u1', lastModified: '', ...(category ? { 'system-category': category } : {}), author, ...extra });

describe('page writes by system-category (#2255, shipped policies)', () => {
  let pip: PolicyInformationPoint;
  let pdp: PolicyDecisionPoint;
  let evaluator: PolicyEvaluator;
  let config: Record<string, unknown>;
  let audit: Array<Record<string, unknown>>;
  let encrypted: boolean;

  beforeEach(async () => {
    config = { ...shipped };
    audit = [];
    encrypted = false;
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def) },
      ValidationManager: { getDefaultSystemCategory: () => 'general' },
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audit.push(e); return Promise.resolve(); } },
      ShareManager: { isEncryptedVault: () => Promise.resolve(encrypted) },
      PageManager: {
        // The real container rule at a door, as PageManager applies it.
        checkPrivatePageAccess: async (ctx: { userContext?: ActorContext }, name: string, adminEntry = 'none') => {
          const parsed = parsePrivatePageName(name);
          if (!parsed) return null;
          if (!ctx.userContext) return false;
          return mayEnterVaultAtDoor(adminEntry === 'none' ? null : pdp, ctx.userContext, { owner: parsed.owner, vault: parsed.store, resource: name }, adminEntry === 'record');
        }
      }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    evaluator = new PolicyEvaluator(engine);
    pdp = new PolicyDecisionPoint(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = pdp;
    await evaluator.initialize();
    pip = new PolicyInformationPoint(engine);
    await pip.initialize();
    managers.PolicyInformationPoint = pip;
  });

  const may = (subject: unknown, action: string, pageMetadata: unknown, pageName = 'P') =>
    pip.checkPagePermissionWithContext({ pageName, userContext: subject, pageMetadata }, action);

  test('an editor edits, deletes and renames a general page but cannot edit documentation or system pages', async () => {
    for (const action of ['edit', 'delete', 'rename']) expect(await may(editor, action, meta('general'))).toBe(true);
    for (const category of ['documentation', 'system', 'addon']) {
      expect(await may(editor, 'edit', meta(category))).toBe(false);
      expect(await may(editor, 'delete', meta(category))).toBe(false);
    }
  });

  test('a page with no system-category is in the default one, and the category is read case-insensitively', async () => {
    expect(await may(editor, 'edit', meta(undefined))).toBe(true);
    expect(await may(editor, 'edit', meta('Documentation'))).toBe(false);
  });

  test('pushed pages are changed by holders of pushed-pages-*, shipped only to admin', async () => {
    for (const category of ['documentation', 'system', 'addon']) {
      for (const action of ['edit', 'delete', 'rename']) expect(await may(admin, action, meta(category))).toBe(true);
    }
  });

  test('a contributor edits a general page but may not delete or rename it, as before', async () => {
    expect(await may(contributor, 'edit', meta('general'))).toBe(true);
    expect(await may(contributor, 'delete', meta('general'))).toBe(false);
    expect(await may(contributor, 'rename', meta('general'))).toBe(false);
  });

  test('a self-managed page is changed by its author and nobody else', async () => {
    for (const category of ['capture', 'user-profile', 'journal']) {
      expect(await may(editor, 'edit', meta(category, 'erin'))).toBe(true);
      expect(await may(editor, 'delete', meta(category, 'erin'))).toBe(true);
      expect(await may(contributor, 'edit', meta(category, 'carl'))).toBe(true);
      expect(await may(editor, 'edit', meta(category, 'carl'))).toBe(false);
      expect(await may(contributor, 'edit', meta(category, 'erin'))).toBe(false);
    }
  });

  test('an admin edits, deletes and renames a self-managed page whoever wrote it', async () => {
    for (const category of ['capture', 'user-profile', 'journal']) {
      for (const action of ['edit', 'delete', 'rename']) expect(await may(admin, action, meta(category, 'erin'))).toBe(true);
    }
  });

  test('a self-managed page with no author fails closed: the author grant cannot apply', async () => {
    const noAuthor = { title: 'P', uuid: 'u1', lastModified: '', 'system-category': 'capture' };
    expect(await may(editor, 'edit', noAuthor)).toBe(false);
    expect(await may(admin, 'edit', noAuthor)).toBe(true);
  });

  test('a category no policy covers is changed by nobody, admin included', async () => {
    expect(await may(admin, 'edit', meta('no-such-category'))).toBe(false);
    expect(await may(editor, 'edit', meta('no-such-category'))).toBe(false);
    // Reading is not a page write; it is unchanged.
    expect(await may(editor, 'view', meta('no-such-category'))).toBe(true);
  });

  test('the decision names the policies that decided it', async () => {
    const d = await pdp.decide(editor, { action: 'page-edit', resource: { type: 'page', id: 'P' }, pageMetadata: meta('general') });
    expect(d.permit).toBe(true);
    expect(d.policyIds).toEqual(['general-page-write']);
    const own = await pdp.decide(editor, { action: 'page-edit', resource: { type: 'page', id: 'P' }, pageMetadata: meta('capture', 'erin') });
    expect(own.policyIds).toEqual(['self-managed-author-write']);
    const none = await pdp.decide(editor, { action: 'page-edit', resource: { type: 'page', id: 'P' }, pageMetadata: meta('documentation') });
    expect(none.permit).toBe(false);
    expect(none.policyIds).toEqual([]);
  });

  test('a page write asked with no page holds when some category grants it (token scopes, affordances)', async () => {
    expect(await pdp.permits(editor as never, 'page-edit')).toBe(true);
    expect(await pdp.permits(user('carl', ['contributor']) as never, 'page-edit')).toBe(true);
    expect(await pdp.permits(user('carl', ['contributor']) as never, 'page-delete')).toBe(false);
    // Every account holds vault-owner, which changes pages in shared folders.
    expect(await pdp.permits(user('rita', ['reader', 'vault-owner']) as never, 'page-edit')).toBe(true);
    expect(await pdp.permits(user('rita', ['reader']) as never, 'page-edit')).toBe(false);
  });

  test('a clean install has nothing to review at boot: no page write on pages by name, no deny, no bad condition, every stored category writable', () => {
    const policies = shipped['ngdpbase.access.policies'] as Policy[];
    expect(pageWritePoliciesToReview(policies)).toEqual([]);
    expect(evaluator.conditionProblemsInForce()).toEqual([]);
    const writable = new Set([...pdp.categoriesGranting('page-edit'), ...pdp.categoriesGranting('pushed-pages-edit')]);
    expect(['general', 'system', 'documentation', 'addon', 'user-profile', 'capture', 'shared', 'journal'].filter((c) => !writable.has(c))).toEqual([]);
  });

  test('the sitemap reads the pushed categories from the policies', () => {
    expect(pdp.categoriesGranting('pushed-pages-edit').sort()).toEqual(['addon', 'documentation', 'system']);
  });

  test('page-categorize is shipped to admin only', async () => {
    expect(await pdp.permits(admin as never, 'page-categorize')).toBe(true);
    expect(await pdp.permits(editor as never, 'page-categorize')).toBe(false);
  });

  test('a page in a shared folder is in the shared category, whatever its frontmatter says', async () => {
    const page = formatPrivatePageName(SHARED_FOLDER_OWNER, 'default', 'Notes');
    expect(pip.pageAttributesFrom(page, meta('general') as never).attributes['system-category']).toBe('shared');
  });

  describe('an administrator in another person\'s vault (ngdpbase.vaults.admin-access)', () => {
    const DIARY = formatPrivatePageName('alice', 'default', 'Diary');

    test('shipped true: an admin reads and edits an unencrypted vault page, and each access is recorded with the admin as actor', async () => {
      expect(await may(admin, 'view', meta('general', 'alice'), DIARY)).toBe(true);
      expect(await may(admin, 'edit', meta('general', 'alice'), DIARY)).toBe(true);
      const entries = audit.filter((e) => e.eventType === 'vault-admin-access');
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ user: 'ada', resource: DIARY, metadata: { owner: 'alice', vault: 'default' } });
    });

    test('an encrypted vault is not entered, whatever the key says', async () => {
      encrypted = true;
      expect(await may(admin, 'view', meta('general', 'alice'), DIARY)).toBe(false);
      expect(audit.filter((e) => e.eventType === 'vault-admin-access')).toHaveLength(0);
    });

    test('false: no administrator enters, as before', async () => {
      config['ngdpbase.vaults.admin-access'] = false;
      expect(await may(admin, 'view', meta('general', 'alice'), DIARY)).toBe(false);
    });

    test('a non-admin is never let in by the key', async () => {
      expect(await may(editor, 'view', meta('general', 'alice'), DIARY)).toBe(false);
    });

    test('a list does not show an admin other people\'s vault pages', async () => {
      const listed = await pip.filterAccessiblePages(admin, 'view', [{ title: DIARY, metadata: meta('general', 'alice') }] as never);
      expect(listed).toEqual([]);
    });
  });
});
