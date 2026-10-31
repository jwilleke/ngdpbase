/**
 * #2190 — an add-on's permission declared `"step-up": true` in its own
 * config/default-config.json is enforced like core's. The declaration goes
 * through the real add-on merge (mergeConfigWithAddons), then the real
 * AuthManager step-up rule and the real PDP: a holder without a fresh factor
 * gets the step-up deny; with one, permit.
 *
 * Sabotage: drop `'step-up'` from the add-on's entry (or stop the merge
 * carrying it) and the "asks for a fresh sign-in" test goes red.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import AuthManager from '../../managers/AuthManager';
import { mergeConfigWithAddons } from '../../utils/addonConfigLayer';
import { STEP_UP_REASON } from '../../types/Policy';

let root: string;

const shipped = {
  'ngdpbase.managers.addons-manager.addons-path': './addons',
  'ngdpbase.addons.ledger.enabled': true,
  'ngdpbase.auth.step-up': { 'max-age-minutes': 60 },
  'ngdpbase.permissions.definitions': { 'page-read': { description: 'View pages' } }
};

function makeEngine(merged: Record<string, unknown>) {
  const authSelf = {
    engine: { getManager: (n: string) => (n === 'ConfigurationManager' ? { getProperty: (k: string, d: unknown) => merged[k] ?? d } : null) },
    warnedLegacyStepUp: false,
    requiredAalFor: () => 0,
    stepUpPolicy() { return AuthManager.prototype.stepUpPolicy.apply(this); }
  };
  const auth = { stepUpNeeded: (...a: Parameters<AuthManager['stepUpNeeded']>) => AuthManager.prototype.stepUpNeeded.apply(authSelf, a) };
  const engine = {
    getManager: (name: string): unknown => {
      if (name === 'AuthManager') return auth;
      if (name === 'PolicyEvaluator') return { evaluateAccess: async () => ({ allowed: true, hasDecision: true, policyName: 'ledger-access' }) };
      if (name === 'AuditManager') return { logAuditEvent: async () => 'evt' };
      return null;
    }
  };
  return new PolicyDecisionPoint(engine);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'addon-stepup-'));
  const dir = path.join(root, 'addons', 'ledger');
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'ledger', ngdpbase: { slug: 'ledger' } }));
  fs.writeFileSync(path.join(dir, 'config', 'default-config.json'), JSON.stringify({
    'ngdpbase.permissions.definitions': {
      'ledger-close': { description: 'Close the books', 'step-up': true },
      'ledger-read': { description: 'Read the ledger' }
    }
  }));
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const subject = (signIn?: { factors: Array<{ aal: number; at: string }> }) =>
  ({ username: 'ann', roles: ['bookkeeper'], isAuthenticated: true, signIn }) as never;
const factorAt = (msAgo: number) => ({ factors: [{ aal: 1, at: new Date(Date.now() - msAgo).toISOString() }] });

describe('#2190 an add-on permission marked "step-up": true', () => {
  test('asks for a fresh sign-in, and permits after one', async () => {
    const { merged, addons } = mergeConfigWithAddons(shipped, {}, root, path.join(root, 'data'));
    expect(addons.map((a) => a.slug)).toEqual(['ledger']);
    const pdp = makeEngine(merged);

    expect(await pdp.decide(subject(factorAt(2 * 3_600_000)), { action: 'ledger-close' }))
      .toMatchObject({ permit: false, reason: STEP_UP_REASON });
    expect(await pdp.decide(subject(), { action: 'ledger-close' }))
      .toMatchObject({ permit: false, reason: STEP_UP_REASON });
    expect(await pdp.decide(subject(factorAt(60_000)), { action: 'ledger-close' }))
      .toMatchObject({ permit: true });
  });

  test('its unmarked sibling never asks', async () => {
    const { merged } = mergeConfigWithAddons(shipped, {}, root, path.join(root, 'data'));
    expect(await makeEngine(merged).decide(subject(), { action: 'ledger-read' })).toMatchObject({ permit: true });
  });
});
