/**
 * #2022: PolicyInformationPoint's page questions take the caller's context
 * and convert it themselves, through `decisionSubject`, the one conversion
 * the PDP also uses.
 *
 * Each question is asked twice, once with a job's `JobContext` as a caller
 * holds it and once with the subject a caller used to build by hand
 * (`toPermissionSubject`), and must give the same answer. The PIP and the PDP
 * are real; policy allows only a subject that arrives with the roles the
 * store gives that account now, keyed by username (never a role name).
 *
 * Sabotaged once (then restored): `asSubject` in PolicyInformationPoint
 * returned the caller unconverted. Which cases went red is recorded in the
 * PR for #2022.
 */
import PolicyInformationPoint from '../PolicyInformationPoint';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import { jobContextFromRequest, toPermissionSubject, type JobContext } from '../../context/JobContext';
import type { ShareGrant } from '../../types/Share';
import { SYSTEM_PRINCIPAL_KEY } from '../../managers/UserManager';

type Meta = Record<string, unknown>;

const PAGES: Record<string, Meta> = {
  Public: { title: 'Public', uuid: 'p1' },
  EditorsOnly: { title: 'EditorsOnly', uuid: 'p2', audience: ['editor'] },
  JimsDiary: { title: 'JimsDiary', uuid: 'p3', private: true, author: 'jim' },
  Locked: { title: 'Locked', uuid: 'p4', 'author-lock': true, author: 'mom' },
  AdminOnly: { title: 'AdminOnly', uuid: 'p5' }
};
const CREATORS: Record<string, string> = { p3: 'jim' };

/** The roles each account holds now, in the store. */
const ROLES: Record<string, string[]> = { jim: ['editor'], mom: [] };
/** What policy grants each account, by name; and only to a subject carrying its live roles. */
const POLICY: Record<string, string[]> = { jim: ['page-read', 'page-edit', 'asset-read'], mom: ['page-read'] };

function makeEngine() {
  const live = (u: string) => [`role-of-${u}`, ...(ROLES[u] ?? [])];
  const allowed = (s: { username: string; roles?: string[] }, pageName: string, action: string) =>
    !pageName.startsWith('Admin') && (s.roles ?? []).includes(`role-of-${s.username}`) && (POLICY[s.username] ?? []).includes(action);
  const engine = {
    getManager: (name: string): unknown => {
      if (name === 'ConfigurationManager') return { getProperty: (k: string, d: unknown) => (k === SYSTEM_PRINCIPAL_KEY ? 'svc' : d), getResolvedDataPath: () => '/tmp/ngdp-pip-context-test', isInitialized: () => true };
      if (name === 'UserManager') return { getUser: async (u: string) => (ROLES[u] ? { username: u, isActive: true } : null) };
      if (name === 'RoleManager') return { resolveUserRoles: async (u: string) => live(u) };
      if (name === 'PolicyEvaluator') {
        const decide = (s: { username: string; roles?: string[] }, pageName: string, action: string) =>
          ({ hasDecision: true, allowed: allowed(s, pageName, action), policyName: 'table', reason: 'test' });
        return {
          evaluateAccess: async ({ userContext, pageName, action }: { userContext: { username: string; roles?: string[] }; pageName: string; action: string }) =>
            decide(userContext, pageName, action),
          compile: (userContext: { username: string; roles?: string[] }, action: string) => (pageName: string) => decide(userContext, pageName, action)
        };
      }
      if (name === 'PageManager') {
        return {
          getPageMetadata: async (n: string) => PAGES[n] ?? null,
          checkPrivatePageAccess: async (ctx: { userContext?: unknown }, n: string) => {
            const md = PAGES[n]; if (!md || md.private !== true) return null;
            if (!ctx.userContext) return false;
            return mayActInPrivateContainer(ctx.userContext, CREATORS[String(md.uuid)]);
          }
        };
      }
      if (name === 'PolicyInformationPoint') return pip;
      if (name === 'PolicyDecisionPoint') return pdp;
      if (name === 'AuditManager') return { logAuditEvent: async () => 'evt' };
      return null;
    }
  };
  const pip = new PolicyInformationPoint(engine);
  const pdp = new PolicyDecisionPoint(engine);
  return pip;
}

const share: ShareGrant = {
  id: 's1', issuer: 'jim', actions: ['page-read', 'asset-read'],
  resources: [{ type: 'media', pattern: 'keyword:trip' }], expiresAt: null
};
const item = (keywords: string[]) => ({ id: 'm1', filePath: '/x/a.jpg', metadata: { keywords } }) as never;

/** The contexts a job carries: plain, under a read-only token, under a share. */
const jobs: Array<[string, JobContext]> = [
  ['jim\'s job', jobContextFromRequest({ username: 'jim' })],
  ['jim\'s job under a read-only token', jobContextFromRequest({ username: 'jim', viaToken: { id: 't', name: 'ro', scopes: ['page-read'] } })],
  ['a job under a share', jobContextFromRequest({ username: 'Anonymous', viaShare: share })]
];

describe('the PIP\'s page questions take a JobContext and convert it themselves (#2022)', () => {
  let pip: PolicyInformationPoint;
  beforeEach(async () => {
    pip = makeEngine();
    await pip.initialize();
  });

  test.each(jobs)('%s: canUserAccessPage and pageAffordanceFor, every page and action', async (_label, job) => {
    const converted = toPermissionSubject(job);
    for (const page of Object.keys(PAGES)) {
      for (const action of ['view', 'edit']) {
        expect(await pip.canUserAccessPage(job, page, action), `${page}/${action}`).toBe(await pip.canUserAccessPage(converted, page, action));
        expect(await pip.pageAffordanceFor(job, page, action), `${page}/${action}`).toBe(await pip.pageAffordanceFor(converted, page, action));
      }
    }
  });

  test.each(jobs)('%s: filterAccessiblePages', async (_label, job) => {
    const candidates = Object.keys(PAGES).map((title) => ({ title, metadata: PAGES[title] as never }));
    for (const action of ['view', 'edit']) {
      expect(await pip.filterAccessiblePages(job, action, candidates)).toEqual(await pip.filterAccessiblePages(toPermissionSubject(job), action, candidates));
    }
  });

  test.each(jobs)('%s: audienceAdmits', async (_label, job) => {
    for (const page of Object.keys(PAGES)) {
      expect(await pip.audienceAdmits(job, PAGES[page] as never), page).toBe(await pip.audienceAdmits(toPermissionSubject(job), PAGES[page] as never));
    }
  });

  test.each(jobs)('%s: canUserAccessMediaItem and canAccessPrivateContainer', async (_label, job) => {
    const converted = toPermissionSubject(job);
    for (const keywords of [['trip'], ['other']]) {
      expect(await pip.canUserAccessMediaItem(job, item(keywords))).toBe(await pip.canUserAccessMediaItem(converted, item(keywords)));
    }
    for (const owner of ['jim', 'mom']) {
      expect(pip.canAccessPrivateContainer(job, owner, 'attachment:a', 'view')).toBe(pip.canAccessPrivateContainer(converted, owner, 'attachment:a', 'view'));
    }
  });

  test('pinned answers for jim\'s job: his live roles decide, not a role carried in the context', async () => {
    const job = jobs[0][1];
    // Tier 1: the audience names a role jim holds now.
    expect(await pip.audienceAdmits(job, PAGES.EditorsOnly as never)).toBe(true);
    // Tier 0: his own private page, and not mom's container.
    expect(await pip.canUserAccessPage(job, 'JimsDiary', 'view')).toBe(true);
    expect(pip.canAccessPrivateContainer(job, 'mom', 'attachment:a', 'view')).toBe(false);
    // Tier 2: policy, asked of the PDP, against his live roles.
    expect(await pip.canUserAccessPage(job, 'Public', 'view')).toBe(true);
    expect(await pip.canUserAccessPage(job, 'AdminOnly', 'view')).toBe(false);
    // A job's share keeps its media ceiling.
    expect(await pip.canUserAccessMediaItem(jobs[2][1], item(['trip']))).toBe(true);
    expect(await pip.canUserAccessMediaItem(jobs[2][1], item(['other']))).toBe(false);
  });
});
