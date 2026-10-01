/**
 * What a user's roles grant, with where — #1539. Against the SHIPPED policies:
 * vault-owner's grants read as limited to vaults; a site-wide grant from
 * another role is not limited.
 */
import fs from 'fs';
import path from 'path';
import PolicyDecisionPoint from '../PolicyDecisionPoint';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
const pdp = new PolicyDecisionPoint({
  getManager: (n: string) => (n === 'ConfigurationManager' ? { getProperty: (k: string, d: unknown) => (k in shipped ? shipped[k] : d) } : null)
});

describe('PolicyDecisionPoint.grantsForRoles (#1539)', () => {
  test('a reader with vault-owner: page-delete only in their vaults, page-read everywhere', () => {
    const grants = new Map(pdp.grantsForRoles(['reader', 'vault-owner']).map((g) => [g.action, g]));
    expect(grants.get('page-delete')).toEqual({ action: 'page-delete', limited: true, where: ['vault'] });
    expect(grants.get('page-read')).toEqual({ action: 'page-read', limited: false, where: [] });
  });

  test('an editor with vault-owner: page-delete is not limited — editor grants it site-wide', () => {
    const grants = new Map(pdp.grantsForRoles(['editor', 'vault-owner']).map((g) => [g.action, g]));
    expect(grants.get('page-delete')?.limited).toBe(false);
  });

  test('rolePermissions agrees with roleGrants — one reading of what a role grants', () => {
    expect([...(pdp.rolePermissions().get('vault-owner') ?? [])].sort()).toEqual(pdp.grantsForRoles(['vault-owner']).map((g) => g.action));
  });
});
