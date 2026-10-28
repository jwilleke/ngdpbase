/**
 * #2038 — `contact-read` and `contact-manage` were renamed `identity-read` and
 * `identity-manage` (identity model, step 3; catalogue change approved by the
 * operator 2026-10-24).
 *
 * - The shipped policies grant the new names to exactly the roles that held
 *   the old ones in v5.29.1: `contact-read` admin and demo-admin,
 *   `contact-manage` admin.
 * - A policy, core's or an add-on's, that still names an old name grants the
 *   new permission, and is warned about once per policy and name.
 * - An agent token scope naming an old name is the new one (RETIRED_PERMISSIONS).
 */
import fs from 'fs';
import path from 'path';
import PolicyDecisionPoint, { POLICIES_KEY, POLICIES_ENABLED_KEY } from '../PolicyDecisionPoint';
import { RETIRED_PERMISSIONS, withRetiredExpanded } from '../../utils/permissionCatalog';
import { CONTACT_PERMISSION } from '../../utils/contactAccess';
import logger from '../../utils/logger';

const shipped = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')) as Record<string, unknown>;
const catalog = shipped['ngdpbase.permissions.definitions'] as Record<string, { label?: string; audit?: unknown }>;
const shippedPolicies = shipped[POLICIES_KEY] as Array<{ id: string; actions?: string[] }>;

/** Who held what in v5.29.1, before the rename: role → the contact permissions its policies granted. */
const HELD_BEFORE: Record<string, string[]> = {
  admin: ['contact-manage', 'contact-read'],
  'demo-admin': ['contact-read']
};
const RENAMED: Record<string, string> = { 'contact-read': 'identity-read', 'contact-manage': 'identity-manage' };

function pdpOver(policies: unknown[]): PolicyDecisionPoint {
  const config = { getProperty: (key: string, d: unknown) => (key === POLICIES_KEY ? policies : key === POLICIES_ENABLED_KEY ? true : d) };
  return new PolicyDecisionPoint({ getManager: (name: string) => (name === 'ConfigurationManager' ? config : null) });
}

/** role → the identity permissions the policies give it, sorted. */
function identityHolders(pdp: PolicyDecisionPoint): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [role, actions] of pdp.rolePermissions()) {
    const held = [...actions].filter((a) => a === 'identity-read' || a === 'identity-manage').sort();
    if (held.length > 0) out[role] = held;
  }
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('#2038 the catalogue', () => {
  test('declares identity-read and identity-manage, and no longer contact-read or contact-manage', () => {
    expect(catalog['identity-read']).toBeDefined();
    expect(catalog['identity-manage']).toBeDefined();
    expect(catalog['contact-read']).toBeUndefined();
    expect(catalog['contact-manage']).toBeUndefined();
  });

  test('the labels people read say identity records, not contacts or people', () => {
    expect(catalog['identity-read'].label).toBe('Find and view identity records (users, contacts and organizations)');
    expect(catalog['identity-manage'].label).toBe('Add, change and link identity records (users, contacts and organizations)');
  });

  test('the change record is the identity-manage audit event', () => {
    expect(catalog['identity-manage'].audit).toMatchObject({ 'on-failure': 'continue' });
  });

  test('the door asks the new names', () => {
    expect(CONTACT_PERMISSION).toEqual({ read: 'identity-read', manage: 'identity-manage' });
  });

  test('no shipped policy names an old name', () => {
    for (const policy of shippedPolicies) {
      expect(policy.actions ?? [], policy.id).not.toContain('contact-read');
      expect(policy.actions ?? [], policy.id).not.toContain('contact-manage');
    }
  });
});

describe('#2038 the shipped policies grant the new names to the same roles as before', () => {
  test('identity-read and identity-manage are held by exactly v5.29.1\'s holders of contact-read and contact-manage', () => {
    const before = Object.fromEntries(Object.entries(HELD_BEFORE).map(([role, names]) => [role, names.map((n) => RENAMED[n]).sort()]));
    // #2093 (operator, 2026-10-28): the executive role, added after the rename, reads identity records.
    expect(identityHolders(pdpOver(shippedPolicies))).toEqual({ ...before, executive: ['identity-read'] });
  });

  test('the shipped policies written with the old names grant the same as with the new ones', () => {
    const toOld = Object.fromEntries(Object.entries(RENAMED).map(([oldName, newName]) => [newName, oldName]));
    const oldNamed = shippedPolicies.map((p) => (p.actions ? { ...p, actions: p.actions.map((a) => toOld[a] ?? a) } : p));
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    expect(identityHolders(pdpOver(oldNamed))).toEqual(identityHolders(pdpOver(shippedPolicies)));
  });
});

describe('#2038 an old name in a policy is read as the new one, with one warning', () => {
  const treasurer = (actions: string[], id = 'accounting-treasurer') =>
    ({ id, name: id, priority: 10, effect: 'allow', subjects: [{ type: 'role', value: 'treasurer' }], resources: [{ type: 'page', pattern: '*' }], actions });

  test('contact-read grants identity-read, contact-manage grants identity-manage', () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const pdp = pdpOver([treasurer(['ledger-read', 'contact-read', 'contact-manage'])]);
    expect([...(pdp.rolePermissions().get('treasurer') ?? [])].sort()).toEqual(['identity-manage', 'identity-read', 'ledger-read']);
  });

  test('the policy is warned about once per old name, naming the policy, however often it is read', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const pdp = pdpOver([treasurer(['contact-read', 'contact-manage'])]);
    pdp.policies();
    pdp.policies();
    pdp.rolePermissions();
    const said = warn.mock.calls.map((c) => String(c[0]));
    expect(said).toHaveLength(2);
    expect(said[0]).toContain("Policy 'accounting-treasurer' names the retired permission 'contact-read'; it is read as 'identity-read'");
    expect(said[1]).toContain("Policy 'accounting-treasurer' names the retired permission 'contact-manage'; it is read as 'identity-manage'");
  });

  test('a second policy naming an old name is warned about too; a policy on the new names never is', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const pdp = pdpOver([treasurer(['contact-read'], 'one'), treasurer(['contact-read'], 'two'), treasurer(['identity-read'], 'new')]);
    pdp.policies();
    pdp.policies();
    expect(warn.mock.calls.map((c) => String(c[0]).match(/Policy '(\w+)'/)?.[1])).toEqual(['one', 'two']);
  });

  test('an agent token scope naming an old name is expanded to the new one', () => {
    expect(RETIRED_PERMISSIONS.get('contact-read')).toEqual(['identity-read']);
    expect(RETIRED_PERMISSIONS.get('contact-manage')).toEqual(['identity-manage']);
    expect(withRetiredExpanded(['contact-read', 'identity-read', 'contact-manage'])).toEqual(['identity-read', 'identity-manage']);
  });
});
