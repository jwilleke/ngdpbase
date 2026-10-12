/**
 * PolicyInformationPoint — the page affordance and the page door (#1668).
 *
 * Showing a control (the view's Edit button) is an affordance: it asks the
 * same evaluator as the door but records nothing. Before #1668 the view asked
 * the door, so every anonymous view wrote an `authorization-deny` record, and
 * that record had no address. A refused action — the door — still writes one,
 * now carrying the request's address.
 */

import PolicyInformationPoint from '../PolicyInformationPoint';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import logger from '../../utils/logger';

/** Every audit record the PIP wrote, through the AuditManager sink. */
let records: Array<Record<string, unknown>> = [];

const IP = '203.0.113.7';

function makeEngine() {
  const engine = {
    getManager: (name: string): unknown => {
      if (name === 'ConfigurationManager') {
        return { getProperty: (_k: string, d: unknown) => d, isInitialized: () => true };
      }
      if (name === 'PolicyEvaluator') {
        // Everyone may read; only an `editor` may edit or delete; anything else
        // is not decided by policy, so the page falls to default deny.
        return {
          evaluateAccess: async ({ userContext, action }: { userContext: { roles?: string[] }; action: string }) => {
            if (action === 'page-read') return { hasDecision: true, allowed: true, policyName: 'read-all' };
            if ((userContext.roles ?? []).includes('editor')) return { hasDecision: true, allowed: true, policyName: 'editors' };
            return { hasDecision: false, allowed: false, reason: 'no_match' };
          }
        };
      }
      if (name === 'PolicyDecisionPoint') return pdp;
      if (name === 'AuditManager') {
        return { logAuditEvent: async (e: Record<string, unknown>) => { records.push(e); return 'evt'; } };
      }
      return null;
    }
  };
  const pdp = new PolicyDecisionPoint(engine);
  return engine as never;
}

const anonymous = { username: 'Anonymous', roles: ['anonymous', 'All'], isAuthenticated: false, ipAddress: IP };
const editor = { username: 'ed', roles: ['editor', 'Authenticated', 'All'], isAuthenticated: true, ipAddress: IP };

function pageCtx(userContext: Record<string, unknown>, pageMetadata: Record<string, unknown> = { title: 'Volcanoes' }) {
  return { pageName: 'Volcanoes', content: 'body', context: 'view', userContext, pageMetadata } as never;
}

/** auditDenial is fire-and-forget; let it land. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('PolicyInformationPoint page affordance vs door (#1668)', () => {
  let pip: PolicyInformationPoint;

  beforeEach(async () => {
    records = [];
    vi.mocked(logger.info).mockClear();
    pip = new PolicyInformationPoint(makeEngine());
    await pip.initialize();
  });

  test('an anonymous visitor\'s Edit affordance is refused and writes no audit record', async () => {
    expect(await pip.pageAffordance(pageCtx(anonymous), 'edit')).toBe(false);
    await settle();
    expect(records).toHaveLength(0);
  });

  test('the affordance writes no [ACL] info line — it runs on every view', async () => {
    await pip.pageAffordance(pageCtx(anonymous), 'edit');
    const aclInfo = vi.mocked(logger.info).mock.calls.filter(([m]) => String(m).startsWith('[ACL]'));
    expect(aclInfo).toHaveLength(0);
  });

  test('a refused edit at the door writes authorization-deny carrying the request address', async () => {
    expect(await pip.checkPagePermissionWithContext(pageCtx(anonymous), 'edit')).toBe(false);
    await settle();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      eventType: 'authorization-deny', user: 'Anonymous', resource: 'Volcanoes',
      action: 'edit', result: 'deny', reason: 'default_deny', ipAddress: IP
    });
  });

  test('the rich door (the editor\'s editRefusal) records the same denial with the address', async () => {
    const decision = await pip.evaluatePagePermission(pageCtx(anonymous), 'edit');
    expect(decision).toEqual({ allowed: false, reason: 'default_deny' });
    await settle();
    expect(records[0]).toMatchObject({ eventType: 'authorization-deny', ipAddress: IP });
  });

  test('a private-container refusal records the address too — one place builds the record', async () => {
    expect(pip.canAccessPrivateContainer(anonymous as never, 'jim', 'attachment:abc', 'view')).toBe(false);
    await settle();
    expect(records[0]).toMatchObject({ eventType: 'authorization-deny', reason: 'private_deny', ipAddress: IP });
  });

  test('a subject without an address records none, never a made-up one', async () => {
    const { ipAddress: _drop, ...noAddress } = anonymous;
    await pip.checkPagePermissionWithContext(pageCtx(noAddress), 'edit');
    await settle();
    expect(records[0]?.ipAddress).toBeUndefined();
  });

  describe('affordance and door agree — one evaluator', () => {
    const pages: Array<[string, Record<string, unknown>]> = [
      ['plain', { title: 'Volcanoes' }],
      ['author-locked', { title: 'Volcanoes', author: 'someone', 'author-lock': true }],
      ['restricted audience', { title: 'Volcanoes', audience: ['editor'] }],
      ['private', { title: 'Volcanoes', private: true, author: 'ed' }]
    ];
    const subjects: Array<[string, Record<string, unknown>]> = [['anonymous', anonymous], ['editor', editor]];
    for (const [pageLabel, metadata] of pages) {
      for (const [subjectLabel, subject] of subjects) {
        for (const action of ['view', 'edit', 'delete']) {
          test(`${subjectLabel} / ${action} / ${pageLabel}`, async () => {
            const affordance = await pip.pageAffordance(pageCtx(subject, metadata), action);
            const door = await pip.checkPagePermissionWithContext(pageCtx(subject, metadata), action);
            expect(affordance).toBe(door);
          });
        }
      }
    }

    test('the matrix is not all one answer — it exercises both allow and deny', async () => {
      expect(await pip.pageAffordance(pageCtx(editor), 'edit')).toBe(true);
      expect(await pip.pageAffordance(pageCtx(anonymous), 'edit')).toBe(false);
    });
  });
});
