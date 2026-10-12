/**
 * #1734 (operator, 2026-10-09; approved 2026-10-12) — the shipped catalog:
 * every signed-in role except demo-admin may mint an agent token (demo-admin
 * excluded by operator decision 2026-10-12); extending one is
 * `token-extend`, held by admin only, grantable, step-up and audited.
 * Asked of the real PDP over the SHIPPED policies.
 *
 * Sabotaged once (2026-10-12): token-mint removed from reader-permissions
 * (the every-role test went red naming reader), and token-extend added to
 * editor-permissions (the admin-only test went red naming editor).
 */
vi.unmock('../../managers/PolicyEvaluator');

import fs from 'fs';
import path from 'path';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import PolicyDecisionPoint from '../PolicyDecisionPoint';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
const roles = Object.keys(shipped['ngdpbase.roles.definitions'] as Record<string, unknown>);
const definitions = shipped['ngdpbase.permissions.definitions'] as Record<string, Record<string, unknown>>;

const pdp = (() => {
  const configManager = { getProperty: (k: string, d: unknown) => (k in shipped ? shipped[k] : d) };
  const managers: Record<string, unknown> = { ConfigurationManager: configManager };
  const engine = { getManager: (n: string) => managers[n] ?? null } as never;
  const evaluator = new PolicyEvaluator(engine);
  (evaluator as unknown as { configManager: unknown }).configManager = configManager;
  managers.PolicyEvaluator = evaluator;
  const decider = new PolicyDecisionPoint(engine);
  managers.PolicyDecisionPoint = decider;
  return decider;
})();
const as = (role: string) => ({ username: 'u', roles: [role], isAuthenticated: role !== 'anonymous' }) as never;

// vault-owner grants only inside the person's own vaults (and self-service); it is
// never an account's only role except while a site role has stepped down.
// demo-admin may not mint (operator, 2026-10-12): a demo visitor changes nothing lasting.
const signedInRoles = roles.filter((r) => r !== 'anonymous' && r !== 'vault-owner' && r !== 'demo-admin');

describe('agent-token permissions as shipped (#1734)', () => {
  test('every signed-in role except demo-admin may mint', async () => {
    const lacking: string[] = [];
    for (const role of signedInRoles) if (!(await pdp.permits(as(role), 'token-mint'))) lacking.push(role);
    expect(lacking).toEqual([]);
  });

  test('anonymous may not mint', async () => {
    expect(await pdp.permits(as('anonymous'), 'token-mint')).toBe(false);
  });

  test('demo-admin may not mint', async () => {
    expect(roles).toContain('demo-admin');
    expect(await pdp.permits(as('demo-admin'), 'token-mint')).toBe(false);
  });

  test('token-extend is held by admin only', async () => {
    const holders: string[] = [];
    for (const role of roles) if (await pdp.permits(as(role), 'token-extend')) holders.push(role);
    expect(holders).toEqual(['admin']);
  });

  test('token-extend is a grantable, step-up permission whose use is audited, refusing when unrecorded', () => {
    const entry = definitions['token-extend'];
    expect(entry).toBeDefined();
    expect(entry.grantable).not.toBe(false);
    expect(entry['step-up']).toBe(true);
    expect(entry.audit).toMatchObject({ 'on-failure': 'refuse' });
  });
});
