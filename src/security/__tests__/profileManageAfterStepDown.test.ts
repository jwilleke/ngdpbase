/**
 * #448 — no lockout: when a session's site roles step down for their
 * required-aal, the person still holds profile-manage through vault-owner (the
 * role every account is given), so they can reach their profile and enrol a
 * passkey. Asked of the real PDP over the SHIPPED policies.
 */
vi.unmock('../../managers/PolicyEvaluator');

import fs from 'fs';
import path from 'path';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import PolicyDecisionPoint from '../PolicyDecisionPoint';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

describe('profile-manage survives a step-down (#448)', () => {
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
  const subject = (roles: string[]) => ({ username: 'admin', roles, isAuthenticated: true }) as never;

  test('an admin/vault-owner account, admin stepped down: still profile-manage, no admin powers', async () => {
    expect(await pdp.permits(subject(['vault-owner']), 'profile-manage')).toBe(true);
    expect(await pdp.permits(subject(['vault-owner']), 'admin-system')).toBe(false);
  });

  test('anonymous never gets profile-manage', async () => {
    expect(await pdp.permits({ username: 'anonymous', roles: ['anonymous'], isAuthenticated: false }, 'profile-manage')).toBe(false);
  });
});
