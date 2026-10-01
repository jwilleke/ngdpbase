/**
 * Pages in your own vault go through the same permission door as any page — #1539.
 *
 * The private-container check (Tier 0) only refuses: it keeps everyone but the
 * owner out. When it lets the owner through, policy decides, and the owner's
 * rights inside their vaults come from the `vault-owner` role, whose policy
 * names the `vault` resource type. Run against the SHIPPED policies, a real
 * PolicyEvaluator and a real PolicyDecisionPoint.
 */

import fs from 'fs';
import path from 'path';
import PolicyInformationPoint from '../PolicyInformationPoint';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import { formatPrivatePageName, parsePrivatePageName } from '../../utils/privateStorePath';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import type { ActorContext } from '../../context/ActorContext';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

const DIARY = formatPrivatePageName('alice', 'default', 'Diary');
const vaultMeta = { title: 'Diary', uuid: 'd1', lastModified: '', 'system-category': 'general' };
const publicMeta = { title: 'Main', uuid: 'm1', lastModified: '', 'system-category': 'general' };

const alice = (roles: string[]) => ({ username: 'alice', roles, isAuthenticated: true });

describe('vault pages answer to policy, not to ownership alone (#1539)', () => {
  let pip: PolicyInformationPoint;
  let pdp: PolicyDecisionPoint;

  beforeEach(async () => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (key: string, def: unknown) => (key in shipped ? shipped[key] : def) },
      // The real container rule, as PageManager applies it.
      PageManager: {
        checkPrivatePageAccess: (ctx: { userContext?: ActorContext }, name: string) => {
          const parsed = parsePrivatePageName(name);
          if (!parsed) return Promise.resolve(null);
          return Promise.resolve(!!ctx.userContext && mayActInPrivateContainer(ctx.userContext, parsed.owner, { vault: parsed.store }));
        }
      }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    const evaluator = new PolicyEvaluator(engine);
    pdp = new PolicyDecisionPoint(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = pdp;
    await evaluator.initialize();
    pip = new PolicyInformationPoint(engine);
    await pip.initialize();
    managers.PolicyInformationPoint = pip;
  });

  const decide = (userContext: unknown, action: string, pageName = DIARY, pageMetadata: unknown = vaultMeta) =>
    pip.checkPagePermissionWithContext({ pageName, userContext, pageMetadata }, action);

  test('a reader without vault-owner may not edit, delete or even read their own vault page', async () => {
    expect(await decide(alice(['reader']), 'edit')).toBe(false);
    expect(await decide(alice(['reader']), 'delete')).toBe(false);
    expect(await decide(alice(['reader']), 'view')).toBe(false);
  });

  test('vault-owner gives the owner everything on their own vault page', async () => {
    for (const action of ['view', 'edit', 'delete', 'rename']) {
      expect(await decide(alice(['reader', 'vault-owner']), action)).toBe(true);
    }
  });

  test('ownership still refuses everyone else — an admin holding vault-owner gets nothing in alice’s vault', async () => {
    const bob = { username: 'bob', roles: ['admin', 'vault-owner'], isAuthenticated: true };
    expect(await decide(bob, 'view')).toBe(false);
    expect(await decide(bob, 'edit')).toBe(false);
  });

  test('the vault grant does not leak: a reader with vault-owner still may not edit a public page', async () => {
    expect(await decide(alice(['reader', 'vault-owner']), 'edit', 'Main', publicMeta)).toBe(false);
    expect(await decide(alice(['reader', 'vault-owner']), 'view', 'Main', publicMeta)).toBe(true);
  });

  test('a capability check with no resource never matches the vault policy', async () => {
    expect(await pdp.permits(alice(['reader', 'vault-owner']) as never, 'page-edit')).toBe(false);
    expect(await pdp.permits(alice(['reader', 'vault-owner']) as never, 'asset-delete')).toBe(false);
  });

  test('the list filter agrees with the decider', async () => {
    const candidates = [{ title: DIARY, metadata: vaultMeta }, { title: 'Main', metadata: publicMeta }];
    expect(await pip.filterAccessiblePages(alice(['reader']) as never, 'edit', candidates as never)).toEqual([]);
    expect(await pip.filterAccessiblePages(alice(['reader', 'vault-owner']) as never, 'edit', candidates as never)).toEqual([DIARY]);
  });
});
