/**
 * Resource attributes from the vault (#2261 slice 5): `vault:owner` and
 * `vault:encrypted`, declared on the `page` type as `vault-owner` and
 * `encrypted`, readable by a policy as `resource:vault-owner` and
 * `resource:encrypted`. Missing, not false, for a page in a shared folder and
 * for an ordinary page, so a condition on one fails closed there.
 *
 * Run against the SHIPPED configuration with a real PolicyEvaluator,
 * PolicyDecisionPoint and PolicyInformationPoint, and the real container rule
 * at the door. Sabotage check: make `vault:` read `false` instead of missing
 * outside a vault, ask `isEncryptedVault` once per page instead of once per
 * vault in a listing, or drop the vault sets from `conditionAttributeSource`,
 * and the missing, list and declaration rows go red.
 */
import fs from 'fs';
import path from 'path';
import PolicyInformationPoint from '../PolicyInformationPoint';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import PolicyValidator from '../../managers/PolicyValidator';
import { formatPrivatePageName, parsePrivatePageName, SHARED_FOLDER_OWNER } from '../../utils/privateStorePath';
import { mayEnterVaultAtDoor } from '../../utils/privateStoreAccess';
import type { ActorContext } from '../../context/ActorContext';
import { attr, val } from '../../managers/__tests__/__fixtures__/conditions';

const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../../', rel), 'utf8')) as Record<string, unknown>;
const core = read('config/app-default-config.json');
const journal = read('addons/journal/config/default-config.json');
const shipped: Record<string, unknown> = {
  ...core,
  'ngdpbase.access.policies': [...(core['ngdpbase.access.policies'] as unknown[]), ...(journal['ngdpbase.access.policies'] as unknown[])],
  'ngdpbase.system-category': { ...(core['ngdpbase.system-category'] as object), ...(journal['ngdpbase.system-category'] as object) }
};

const user = (username: string, roles: string[]) => ({ username, roles, isAuthenticated: true });
const alice = user('alice', ['editor', 'vault-owner']);
const editor = user('erin', ['editor']);
const admin = user('ada', ['admin', 'vault-owner']);
const meta = (category = 'general', author = 'system') => ({ title: 'P', uuid: 'u1', lastModified: '', 'system-category': category, author });

const DIARY = formatPrivatePageName('alice', 'default', 'Diary');
const SECRET = formatPrivatePageName('alice', 'secret', 'Notes');
const SHARED = formatPrivatePageName(SHARED_FOLDER_OWNER, 'docs', 'Plan');
const PUBLIC = 'Main';

/** The custom configuration the spec's Verified-when names: `encrypted` and `vault-owner` as vault: attributes on `page`. */
const customTypes = (extra: Record<string, unknown> = {}) => ({
  ...(core['ngdpbase.access.resource-types'] as Record<string, unknown>),
  page: {
    attributes: {
      'system-category': { type: 'string', from: 'frontmatter:system-category' },
      owner: { type: 'identity', from: 'frontmatter:author' },
      encrypted: { type: 'boolean', from: 'vault:encrypted' },
      'vault-owner': { type: 'identity', from: 'vault:owner' }
    }
  },
  ...extra
});

describe('resource attributes from the vault (#2261 slice 5)', () => {
  let pip: PolicyInformationPoint;
  let pdp: PolicyDecisionPoint;
  let evaluator: PolicyEvaluator;
  let validator: PolicyValidator;
  let config: Record<string, unknown>;
  let encryptedVaults: Set<string>;
  let encryptedCalls: string[];
  let managers: Record<string, unknown>;

  const boot = async (overrides: Record<string, unknown> = {}) => {
    config = { ...shipped, ...overrides };
    encryptedCalls = [];
    managers = {
      ConfigurationManager: { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def), getUnresolvedProperty: (key: string, def: unknown) => (key in config ? config[key] : def) },
      ValidationManager: { getDefaultSystemCategory: () => 'general' },
      AuditManager: { logAuditEvent: () => Promise.resolve() },
      ShareManager: {
        isEncryptedVault: (owner: string, vault: string) => {
          encryptedCalls.push(`${owner}/${vault}`);
          return Promise.resolve(encryptedVaults.has(`${owner}/${vault}`));
        }
      },
      PageManager: {
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
    validator = new PolicyValidator(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = pdp;
    await evaluator.initialize();
    pip = new PolicyInformationPoint(engine);
    await pip.initialize();
    managers.PolicyInformationPoint = pip;
    await validator.initialize();
  };

  beforeEach(() => { encryptedVaults = new Set(['alice/secret']); });

  const may = (subject: unknown, action: string, pageName: string, pageMetadata: unknown = meta()) =>
    pip.checkPagePermissionWithContext({ pageName, userContext: subject, pageMetadata }, action);
  const attribute = async (pageName: string, name: string, metadata: unknown = meta()) =>
    pip.pageAttributesFrom(pageName, metadata).read(name);
  const denyEditOn = (condition: unknown, resources: unknown[] = [{ type: 'system-category', pattern: 'general' }]) => ({
    id: 'no-edit-encrypted', name: 'no-edit-encrypted', effect: 'deny', subjects: [{ type: 'anyone' }], resources, actions: ['page-edit'], condition
  });
  const ENCRYPTED = { 'boolean-equal': [attr('resource:encrypted', 'boolean'), val(true, 'boolean')] };
  const withDeny = (resources?: unknown[]) => ({
    ...Object.fromEntries(Object.entries(shipped)),
    'ngdpbase.access.resource-types': customTypes(),
    'ngdpbase.access.policies': [...(shipped['ngdpbase.access.policies'] as unknown[]), denyEditOn(ENCRYPTED, resources)]
  });

  describe('the shipped configuration declares them on the page type', () => {
    beforeEach(() => boot());

    test('encrypted is a boolean from vault:encrypted and vault-owner an identity from vault:owner', () => {
      const attrs = (core['ngdpbase.access.resource-types'] as { page: { attributes: Record<string, unknown> } }).page.attributes;
      expect(attrs.encrypted).toEqual({ type: 'boolean', from: 'vault:encrypted' });
      expect(attrs['vault-owner']).toEqual({ type: 'identity', from: 'vault:owner' });
    });
  });

  describe('vault:owner and vault:encrypted', () => {
    beforeEach(() => boot({ 'ngdpbase.access.resource-types': customTypes() }));

    test('a page in an unencrypted vault: its owner, encrypted false', async () => {
      expect(await attribute(DIARY, 'vault-owner')).toBe('alice');
      expect(await attribute(DIARY, 'encrypted')).toBe(false);
    });

    test('a page in an encrypted vault: encrypted true', async () => {
      expect(await attribute(SECRET, 'vault-owner')).toBe('alice');
      expect(await attribute(SECRET, 'encrypted')).toBe(true);
    });

    test('a page in a shared folder has neither: missing, not false', async () => {
      expect(await attribute(SHARED, 'vault-owner')).toBeUndefined();
      expect(await attribute(SHARED, 'encrypted')).toBeUndefined();
    });

    test('an ordinary public page has neither: missing, not false', async () => {
      expect(await attribute(PUBLIC, 'vault-owner')).toBeUndefined();
      expect(await attribute(PUBLIC, 'encrypted')).toBeUndefined();
    });

    test('a vault owner is compared as an account name: lower-cased', async () => {
      expect(await attribute(formatPrivatePageName('Alice', 'default', 'Diary'), 'vault-owner')).toBe('alice');
    });

    test('a vault whose encryption cannot be read has no encrypted attribute: missing, not false', async () => {
      (managers.ShareManager as { isEncryptedVault: unknown }).isEncryptedVault = () => Promise.reject(new Error('disk'));
      expect(await attribute(DIARY, 'encrypted')).toBeUndefined();
      expect(await attribute(DIARY, 'vault-owner')).toBe('alice');
      delete managers.ShareManager;
      expect(await attribute(DIARY, 'encrypted')).toBeUndefined();
    });

    test('a vault whose encryption check throws synchronously has no encrypted attribute: missing, not an error', async () => {
      (managers.ShareManager as { isEncryptedVault: unknown }).isEncryptedVault = () => { throw new Error('boom'); };
      expect(await attribute(DIARY, 'encrypted')).toBeUndefined();
      expect(await attribute(DIARY, 'vault-owner')).toBe('alice');
    });

    test('a deny that relies on vault:encrypted still applies when the check throws synchronously', async () => {
      await boot(withDeny([{ type: 'vault', pattern: '*' }]));
      expect(await may(alice, 'edit', DIARY)).toBe(true); // control: the check works, the vault is not encrypted
      (managers.ShareManager as { isEncryptedVault: unknown }).isEncryptedVault = () => { throw new Error('boom'); };
      expect(await may(alice, 'edit', DIARY)).toBe(false); // encrypted is missing, so the deny applies
    });

    test('a page with no metadata has no attributes', () => {
      expect(pip.pageAttributesFrom(DIARY, null).read('vault-owner')).toBeUndefined();
    });

    test('a vault: source on an attribute of a type it does not fit reads as missing', async () => {
      Object.assign(config, { 'ngdpbase.access.resource-types': { ...customTypes(), page: { attributes: { 'vault-owner': { type: 'boolean', from: 'vault:owner' }, x: { type: 'string', from: 'vault:nope' } } } } });
      expect(await attribute(DIARY, 'vault-owner')).toBeUndefined();
      expect(await attribute(DIARY, 'x')).toBeUndefined();
    });

    test('the page set stays readable: system-category and owner are unchanged', async () => {
      expect(await attribute(PUBLIC, 'system-category', meta('Journal'))).toBe('journal');
      expect(await attribute(PUBLIC, 'owner', meta('general', 'alice'))).toBe('alice');
    });
  });

  describe('a list reads the same attributes as a single page', () => {
    beforeEach(() => boot({ 'ngdpbase.access.resource-types': customTypes() }));

    const candidates = [
      { title: DIARY, metadata: meta() },
      { title: SECRET, metadata: meta() },
      { title: formatPrivatePageName('alice', 'default', 'Other'), metadata: meta() },
      { title: formatPrivatePageName('alice', 'secret', 'More'), metadata: meta() },
      { title: PUBLIC, metadata: meta() }
    ];

    test('a deny on an encrypted vault: the list and each page\'s own decision agree, and only the encrypted vault is refused', async () => {
      await boot({
        'ngdpbase.access.resource-types': customTypes(),
        'ngdpbase.access.policies': [...(shipped['ngdpbase.access.policies'] as unknown[]), { ...denyEditOn(ENCRYPTED, [{ type: 'vault', pattern: '*' }]), actions: ['page-read'] }]
      });
      const single: string[] = [];
      for (const c of candidates) if (await may(alice, 'view', c.title, c.metadata)) single.push(c.title);
      const listed = await pip.filterAccessiblePages(alice, 'view', candidates);
      expect(listed).toEqual(single);
      expect(listed).toEqual([DIARY, formatPrivatePageName('alice', 'default', 'Other'), PUBLIC]);
    });

    test('a listing asks whether a vault is encrypted once per vault, not once per page', async () => {
      await pip.filterAccessiblePages(alice, 'view', candidates);
      const asked = encryptedCalls.filter((c) => c === 'alice/secret');
      expect(asked.length).toBeLessThanOrEqual(1);
    });
  });

  describe('the spec\'s Verified-when scenarios', () => {
    test('a deny page-edit for anyone on general with resource:encrypted == true refuses edits in an encrypted vault, and (missing, fail closed) on an ordinary public page; removing it restores both', async () => {
      await boot(withDeny());
      expect(validator.policyProblems((config['ngdpbase.access.policies'] as unknown[]).slice(-1))).toEqual([]);
      expect(await may(alice, 'edit', SECRET)).toBe(false);
      expect(await may(editor, 'edit', PUBLIC)).toBe(false);
      // An unencrypted vault page is not refused: encrypted is false there.
      expect(await may(alice, 'edit', DIARY)).toBe(true);

      await boot();
      expect(await may(alice, 'edit', SECRET)).toBe(true);
      expect(await may(editor, 'edit', PUBLIC)).toBe(true);
    });

    test('with a resources entry of type vault the deny stays off public pages', async () => {
      await boot(withDeny([{ type: 'vault', pattern: '*' }]));
      expect(validator.policyProblems((config['ngdpbase.access.policies'] as unknown[]).slice(-1))).toEqual([]);
      expect(await may(alice, 'edit', SECRET)).toBe(false);
      expect(await may(editor, 'edit', PUBLIC)).toBe(true);
    });

    test('that deny does not touch a shared-folder page: it is not a vault page, so the vault resource does not match', async () => {
      await boot(withDeny([{ type: 'vault', pattern: '*' }]));
      expect(await may(alice, 'view', SHARED)).toBe(await (async () => { await boot(); return may(alice, 'view', SHARED); })());
    });

    test('a condition on a vault-only attribute reads it through a policy naming the vault type; a vault-declared attribute is readable only by a policy naming vault', async () => {
      const types = customTypes({ vault: { attributes: { tier: { type: 'string', from: 'frontmatter:tier' } } } });
      await boot({ 'ngdpbase.access.resource-types': types });
      const tier = { 'string-equal': [attr('resource:tier'), val('gold')] };
      const forVault = denyEditOn(tier, [{ type: 'vault', pattern: '*' }]);
      const forCategory = denyEditOn(tier, [{ type: 'system-category', pattern: 'system' }]);
      expect(validator.policyProblems([forVault])).toEqual([]);
      expect(validator.policyProblems([forCategory]).join(' ')).toMatch(/resource:tier.*not declared/);
      expect(await attribute(DIARY, 'tier', { ...meta(), tier: 'gold' })).toBe('gold');
    });

    test('an administrator opening a page in an encrypted vault is still refused with ngdpbase.vaults.admin-access true', async () => {
      await boot({ 'ngdpbase.access.resource-types': customTypes(), 'ngdpbase.vaults.admin-access': true });
      expect(await may(admin, 'view', DIARY)).toBe(true); // control: an unencrypted vault is entered
      expect(await may(admin, 'view', SECRET)).toBe(false);
      expect(await may(admin, 'edit', SECRET)).toBe(false);
    });

    test('an encrypted-vault deny does not let an admin in either way: the container rule is unchanged', async () => {
      await boot({ ...withDeny(), 'ngdpbase.vaults.admin-access': true });
      expect(await may(admin, 'view', SECRET)).toBe(false);
      expect(await may(admin, 'edit', SECRET)).toBe(false);
    });
  });

  describe('shipped policies decide as they did before this slice', () => {
    beforeEach(() => boot());

    const subjects: Array<[string, unknown]> = [['admin', admin], ['editor', editor], ['alice', alice], ['anonymous', { username: 'anonymous', roles: ['anonymous'], isAuthenticated: false }]];
    const pages: Array<[string, string, string]> = [['public general', PUBLIC, 'general'], ['documentation', 'Guide', 'documentation'], ['alice vault', DIARY, 'general'], ['alice encrypted vault', SECRET, 'general'], ['shared folder', SHARED, 'general']];

    test('twenty representative requests: the same outcomes as on master', async () => {
      const outcomes: Record<string, string> = {};
      for (const [who, subject] of subjects) {
        for (const [label, name, category] of pages) {
          const row = [];
          for (const action of ['view', 'edit']) row.push(`${action}:${(await may(subject, action, name, meta(category))) ? 'allow' : 'deny'}`);
          outcomes[`${who} / ${label}`] = row.join(' ');
        }
      }
      expect(outcomes).toMatchInlineSnapshot(`
        {
          "admin / alice encrypted vault": "view:deny edit:deny",
          "admin / alice vault": "view:allow edit:allow",
          "admin / documentation": "view:allow edit:allow",
          "admin / public general": "view:allow edit:allow",
          "admin / shared folder": "view:allow edit:allow",
          "alice / alice encrypted vault": "view:allow edit:allow",
          "alice / alice vault": "view:allow edit:allow",
          "alice / documentation": "view:allow edit:deny",
          "alice / public general": "view:allow edit:allow",
          "alice / shared folder": "view:deny edit:deny",
          "anonymous / alice encrypted vault": "view:deny edit:deny",
          "anonymous / alice vault": "view:deny edit:deny",
          "anonymous / documentation": "view:allow edit:deny",
          "anonymous / public general": "view:allow edit:deny",
          "anonymous / shared folder": "view:deny edit:deny",
          "editor / alice encrypted vault": "view:deny edit:deny",
          "editor / alice vault": "view:deny edit:deny",
          "editor / documentation": "view:allow edit:deny",
          "editor / public general": "view:allow edit:allow",
          "editor / shared folder": "view:deny edit:deny",
        }
      `);
    });

    test('a clean install has nothing to review at boot', () => {
      expect(evaluator.conditionProblemsInForce()).toEqual([]);
    });
  });
});
