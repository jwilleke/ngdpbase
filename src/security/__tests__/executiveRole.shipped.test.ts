/**
 * #2093 (operator, 2026-10-28) — the shipped `executive` role, asked of the
 * real PDP over the SHIPPED policies: it reads what the organization keeps
 * and opens the Executive Hub, and changes nothing. `executive-read` is held
 * by the executive role alone. Deciding board requests comes from add-ons'
 * own grants (#2094), not from core.
 *
 * Sabotaged once (2026-10-28): page-edit added to executive-permissions (the
 * changes-nothing test went red naming page-edit), and executive-read added
 * to reader-permissions (the only-executive test went red naming reader).
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

const READS = ['page-read', 'asset-read', 'media-read', 'search-page', 'page-export', 'identity-read', 'user-read', 'search-user', 'executive-read'];

describe('the executive role as shipped (#2093)', () => {
  test('it is declared, and grantable executive-read exists', () => {
    expect(roles).toContain('executive');
    expect(definitions['executive-read']).toMatchObject({ label: 'Open the Executive Hub', icon: 'landmark' });
    expect(definitions['executive-read'].grantable).not.toBe(false);
  });

  test('it holds exactly the approved reads', async () => {
    const lacking: string[] = [];
    for (const p of READS) if (!(await pdp.permits(as('executive'), p))) lacking.push(p);
    expect(lacking).toEqual([]);
  });

  test('it changes nothing: every other grantable permission is refused', async () => {
    const held: string[] = [];
    for (const [p, d] of Object.entries(definitions)) {
      if (d.grantable === false || READS.includes(p)) continue;
      if (await pdp.permits(as('executive'), p)) held.push(p);
    }
    expect(held).toEqual([]);
  });

  test('only the executive role holds executive-read', async () => {
    const holders: string[] = [];
    for (const role of roles) if (await pdp.permits(as(role), 'executive-read')) holders.push(role);
    expect(holders).toEqual(['executive']);
  });
});
