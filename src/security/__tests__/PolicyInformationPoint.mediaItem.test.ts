/**
 * PolicyInformationPoint.canUserAccessMediaItem (#1223, epic #1225).
 *
 * The media door used to ask only one question — may this user view the
 * page the item is linked to — straight from MediaManager.getItem. The share
 * routes then answered a second question of their own (is the item in the
 * share's live scope), which is the second door the framework forbids. The
 * question now lives in the evaluator: for a share subject the share is a
 * ceiling on the item exactly as it is on a page — `asset-read` delegated,
 * unexpired, the item's keywords covered, not private, the issuer still
 * holding `asset-read` live — and then the linked-page rule runs as for any
 * visitor. An ordinary session is unchanged: linked-page rule only.
 */

import PolicyInformationPoint from '../PolicyInformationPoint';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import type { ShareGrant } from '../../types/Share';

let issuerHolds: string[] = ['asset-read'];
let denials: Array<Record<string, unknown>> = [];

function makeEngine() {
  const engine = {
    getManager: (name: string): unknown => {
      if (name === 'ConfigurationManager') {
        return { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: () => '/tmp/ngdp-acl-media-test', isInitialized: () => true };
      }
      if (name === 'PolicyEvaluator') {
        return {
          evaluateAccess: async ({ userContext }: { userContext: { roles?: string[] } }) => {
            const anon = (userContext.roles ?? []).includes('anonymous');
            return { hasDecision: true, allowed: !anon, reason: 'test', policyName: anon ? 'deny-anon' : 'allow-all' };
          }
        };
      }
      if (name === 'PolicyDecisionPoint') {
        return pdp;
      }
      if (name === 'PageManager') {
        // Linked pages: 'Public' anyone may see (tier 1 audience All); 'Secret' is private to bob.
        return {
          getPageMetadata: async (name: string) =>
            name === 'Public' ? { audience: ['All'] } : name === 'Secret' ? { private: true, author: 'bob' } : null
        };
      }
      if (name === 'AuditManager') {
        return { logAuditEvent: async (e: Record<string, unknown>) => { denials.push(e); return 'evt'; } };
      }
      return null;
    }
  };
  // #1431 step 14: decisions are the PDP's. A real one, so the share ceiling
  // runs as shipped; only its lookup of what the issuer holds live is stubbed.
  const pdp = new PolicyDecisionPoint(engine);
  vi.spyOn(pdp, 'userHoldsPermission').mockImplementation(async (u: string, a: string) =>
    u === 'jim' && issuerHolds.includes(a));
  return engine as never;
}

const grant: ShareGrant = {
  id: 'share-1', issuer: 'jim', actions: ['page-read', 'asset-read'],
  resources: [{ type: 'page', pattern: 'keyword:trip' }, { type: 'media', pattern: 'keyword:trip' }],
  expiresAt: null
};

const anonymous = { username: 'Anonymous', roles: ['anonymous', 'All'], isAuthenticated: false };
const viaShare = (over: Partial<ShareGrant> = {}) => ({ ...anonymous, viaShare: { ...grant, ...over } });
const editor = { username: 'ed', roles: ['editor', 'Authenticated', 'All'], isAuthenticated: true };

const item = (over: Record<string, unknown> = {}) =>
  ({ id: 'm1', filePath: '/x/a.jpg', metadata: { keywords: ['trip'] }, ...over }) as never;

describe('canUserAccessMediaItem — a share subject (#1223)', () => {
  let acl: PolicyInformationPoint;
  beforeEach(async () => {
    issuerHolds = ['asset-read'];
    denials = [];
    acl = new PolicyInformationPoint(makeEngine());
    await acl.initialize();
  });

  test('a covered item with no linked page is allowed', async () => {
    expect(await acl.canUserAccessMediaItem(viaShare(), item())).toBe(true);
  });

  test('an item whose keywords the share does not cover is refused', async () => {
    expect(await acl.canUserAccessMediaItem(viaShare(), item({ metadata: { keywords: ['other'] } }))).toBe(false);
    expect(await acl.canUserAccessMediaItem(viaShare(), item({ metadata: {} }))).toBe(false);
  });

  test('a single-string keyword field is read the way the provider writes it', async () => {
    expect(await acl.canUserAccessMediaItem(viaShare(), item({ metadata: { keywords: 'trip' } }))).toBe(true);
  });

  test('a share that does not delegate asset-read is refused', async () => {
    expect(await acl.canUserAccessMediaItem(viaShare({ actions: ['page-read'] }), item())).toBe(false);
  });

  test('an expired share is refused', async () => {
    expect(await acl.canUserAccessMediaItem(viaShare({ expiresAt: new Date(Date.now() - 1000).toISOString() }), item())).toBe(false);
  });

  test('an issuer who lost asset-read takes the share with them', async () => {
    expect(await acl.canUserAccessMediaItem(viaShare(), item())).toBe(true);
    issuerHolds = [];
    expect(await acl.canUserAccessMediaItem(viaShare(), item())).toBe(false);
  });

  test('owner-only content is refused', async () => {
    expect(await acl.canUserAccessMediaItem(viaShare(), item({ metadata: { keywords: ['trip', 'owner-only'] } }))).toBe(false);
  });

  test('a refusal is attributed to the share and its issuer', async () => {
    await acl.canUserAccessMediaItem(viaShare(), item({ metadata: { keywords: ['other'] } }));
    await new Promise((r) => setTimeout(r, 0));
    const deny = denials.find((d) => d.eventType === 'authorization-deny');
    expect(deny).toMatchObject({ resourceType: 'media', resource: 'm1', action: 'asset-read' });
    expect(deny?.metadata).toMatchObject({ viaShareId: 'share-1', viaShareIssuer: 'jim' });
  });
});

describe('canUserAccessMediaItem — an ordinary subject is unchanged (#1223)', () => {
  let acl: PolicyInformationPoint;
  beforeEach(async () => {
    acl = new PolicyInformationPoint(makeEngine());
    await acl.initialize();
  });

  test('allowed whatever the keywords: media carries no per-item privacy (#1427)', async () => {
    expect(await acl.canUserAccessMediaItem(editor, item({ metadata: { keywords: ['whatever'] } }))).toBe(true);
    expect(await acl.canUserAccessMediaItem(anonymous, item())).toBe(true);
  });

});
