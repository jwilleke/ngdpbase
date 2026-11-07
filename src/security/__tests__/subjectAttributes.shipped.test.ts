/**
 * Subject attributes and `subject:aal` (#2261, slice 3).
 *
 * Run against the SHIPPED configuration with a real PolicyEvaluator,
 * PolicyDecisionPoint and PolicyInformationPoint: the PDP is asked about a page
 * and the PIP filters a listing, with a policy added that needs a sign-in level.
 * Sabotage check: make `effectiveAal` return `signIn.aal` for a token, or drop
 * `aalFactsOf(subject)` in the PDP, and the token and job rows go red.
 */
import fs from 'fs';
import path from 'path';
import PolicyInformationPoint from '../PolicyInformationPoint';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import { ANONYMOUS_SUBJECT } from '../../managers/UserManager';
import { toPermissionSubject, type JobContext } from '../../context/JobContext';
import { aalFactsOf } from '../../utils/policyAttributes';

const core = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

const AAL2 = { attribute: 'subject:aal', 'greater-or-equal': 2 };
const policy = (id: string, effect: 'allow' | 'deny', actions: string[], condition?: unknown) =>
  ({ id, effect, subjects: [{ type: 'role', value: 'qa' }], resources: [{ type: 'system-category', pattern: 'general' }], actions, ...(condition ? { condition } : {}) });

const meta = { title: 'P', uuid: 'u1', lastModified: '', 'system-category': 'general', author: 'system' };
const signedIn = (aal: number, extra: Record<string, unknown> = {}) => ({ username: 'quinn', roles: ['qa'], isAuthenticated: true, signIn: { provider: 'password', factors: [], at: '2026-01-01T00:00:00Z', aal }, ...extra });
const token = (aal: number | undefined, scopes = ['page-edit', 'page-read']) =>
  ({ username: 'quinn', roles: ['qa'], isAuthenticated: true, viaToken: { id: 'tok_1', name: 't', scopes, ...(aal ? { aal } : {}) } });

describe('subject:aal (#2261 slice 3, shipped configuration)', () => {
  let pip: PolicyInformationPoint;
  let pdp: PolicyDecisionPoint;
  let evaluator: PolicyEvaluator;
  let config: Record<string, unknown>;
  let accounts: Record<string, Record<string, unknown>>;

  const boot = async (policies: unknown[]) => {
    config = { ...core, 'ngdpbase.access.policies': policies };
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def) },
      ValidationManager: { getDefaultSystemCategory: () => 'general' },
      AuditManager: { logAuditEvent: () => Promise.resolve() },
      UserManager: { getUser: (name: string) => Promise.resolve(accounts[name]) },
      PageManager: { checkPrivatePageAccess: () => Promise.resolve(null) }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    evaluator = new PolicyEvaluator(engine);
    pdp = new PolicyDecisionPoint(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = pdp;
    await evaluator.initialize();
    pip = new PolicyInformationPoint(engine);
    await pip.initialize();
    managers.PolicyInformationPoint = pip;
  };
  const decide = (subject: unknown, action = 'page-edit') =>
    pdp.decide(subject, { action, resource: { type: 'page', id: 'P' }, pageMetadata: meta });

  beforeEach(() => { accounts = {}; });

  describe('a policy that needs AAL 2', () => {
    beforeEach(() => boot([policy('qa-edit-aal2', 'allow', ['page-edit'], AAL2), policy('qa-read', 'allow', ['page-read'])]));

    test('an AAL2 session edits; an AAL1 session is refused with that policy absent from policyIds', async () => {
      expect(await decide(signedIn(2))).toMatchObject({ permit: true, policyIds: ['qa-edit-aal2'] });
      expect(await decide(signedIn(3))).toMatchObject({ permit: true });
      const refused = await decide(signedIn(1));
      expect(refused.permit).toBe(false);
      expect(refused.policyIds).not.toContain('qa-edit-aal2');
    });

    test('a session with no sign-in record (from before #1523) is AAL 1', async () => {
      const { signIn: _gone, ...bare } = signedIn(2);
      expect((await decide(bare)).permit).toBe(false);
    });

    test('the level never exceeds what the account can reach (aalCap)', async () => {
      expect((await decide(signedIn(2, { aalCap: 1 }))).permit).toBe(false);
      expect((await decide(signedIn(2, { aalCap: 2 }))).permit).toBe(true);
    });

    test('a signed-out visitor has no level: the condition is unknown and fails closed', async () => {
      expect((await decide({ ...ANONYMOUS_SUBJECT, roles: ['qa'] })).permit).toBe(false);
    });

    test('a token carries the level stored with it: AAL2 edits, AAL1 is refused, none is refused', async () => {
      expect((await decide(token(2))).permit).toBe(true);
      expect((await decide(token(1))).permit).toBe(false);
      expect((await decide(token(undefined))).permit).toBe(false);
    });

    test('a token\'s stored level is not the session\'s: a session level on the token\'s subject changes nothing', async () => {
      expect((await decide({ ...token(1), signIn: signedIn(3).signIn })).permit).toBe(false);
      expect((await decide({ ...token(undefined), signIn: signedIn(3).signIn })).permit).toBe(false);
    });

    test('a share visitor has no level', async () => {
      expect((await decide(signedIn(3, { viaShare: { id: 's1', resources: [], actions: ['page-edit'] } }))).permit).toBe(false);
    });

    test('a job subject reads the level stored with its request, never a session\'s', async () => {
      const job = (aal?: 1 | 2 | 3): JobContext => ({ username: 'quinn', origin: 'request', requestedAt: '2026-01-01T00:00:00Z', ...(aal ? { aal } : {}) });
      const read = (ctx: JobContext, extra: Record<string, unknown> = {}) =>
        pip.subjectAttribute({ ...aalFactsOf({ ...toPermissionSubject(ctx), ...extra }), username: 'quinn', isAuthenticated: true }, 'subject:aal');
      expect(await read(job(2))).toBe(2);
      expect(await read(job(1))).toBe(1);
      expect(await read(job())).toBeUndefined();
      expect(await read(job(), { signIn: signedIn(3).signIn })).toBeUndefined();
    });

    test('reading is unaffected, and the page list agrees with the door in both directions', async () => {
      const candidates = [{ title: 'P', metadata: meta }];
      expect((await decide(signedIn(1), 'page-read')).permit).toBe(true);
      expect(await pip.filterAccessiblePages(signedIn(1) as never, 'view', candidates)).toEqual(['P']);
      expect(await pip.filterAccessiblePages(signedIn(1) as never, 'edit', candidates)).toEqual([]);
      expect(await pip.filterAccessiblePages(signedIn(2) as never, 'edit', candidates)).toEqual(['P']);
      expect(await pip.filterAccessiblePages(token(2) as never, 'edit', candidates)).toEqual(['P']);
      expect(await pip.filterAccessiblePages(token(undefined) as never, 'edit', candidates)).toEqual([]);
    });
  });

  test('a deny on less-or-equal 1 applies to a token with no level (missing), not to an AAL2 session', async () => {
    await boot([policy('qa-edit', 'allow', ['page-edit']), policy('qa-no-weak-edit', 'deny', ['page-edit'], { attribute: 'subject:aal', 'less-or-equal': 1 })]);
    expect(await decide(token(undefined))).toMatchObject({ permit: false, policyIds: ['qa-no-weak-edit'] });
    expect((await decide(token(1))).permit).toBe(false);
    expect((await decide(signedIn(1))).permit).toBe(false);
    expect((await decide(signedIn(2))).permit).toBe(true);
    expect((await decide(token(2))).permit).toBe(true);
  });

  describe('a site-declared attribute', () => {
    const DEPT = { attribute: 'subject:department-id', equals: 'x' };

    test('undeclared: reported with where to add it, and it never holds', async () => {
      await boot([policy('qa-dept', 'allow', ['page-edit'], DEPT)]);
      accounts.quinn = { username: 'quinn', department: 'x' };
      expect(evaluator.conditionProblemsInForce()).toEqual([
        { id: 'qa-dept', effect: 'allow', problems: ["condition reads 'subject:department-id', which is not declared; add it to ngdpbase.access.subject-attributes"] }
      ]);
      expect((await decide(signedIn(1))).permit).toBe(false);
    });

    test('declared with profile:department: holds for an account with department "x", fails closed without', async () => {
      await boot([policy('qa-dept', 'allow', ['page-edit'], DEPT)]);
      config['ngdpbase.access.subject-attributes'] = { ...(core['ngdpbase.access.subject-attributes'] as object), 'department-id': { type: 'string', from: 'profile:department' } };
      expect(evaluator.conditionProblemsInForce()).toEqual([]);
      accounts.quinn = { username: 'quinn', department: 'x' };
      accounts.quentin = { username: 'quentin' };
      accounts.quincy = { username: 'quincy', department: 'y' };
      expect((await decide(signedIn(1))).permit).toBe(true);
      expect((await decide({ ...signedIn(1), username: 'quentin' })).permit).toBe(false);
      expect((await decide({ ...signedIn(1), username: 'quincy' })).permit).toBe(false);
    });

    test('a field of the wrong type is missing, not coerced', async () => {
      await boot([policy('qa-dept', 'allow', ['page-edit'], DEPT)]);
      config['ngdpbase.access.subject-attributes'] = { 'department-id': { type: 'string', from: 'account:department' } };
      accounts.quinn = { username: 'quinn', department: 7 };
      expect((await decide(signedIn(1))).permit).toBe(false);
    });

    test('an attribute whose source is the password, the email or the roles cannot be used', async () => {
      await boot([policy('qa-pw', 'allow', ['page-edit'], { attribute: 'subject:secret', equals: 'x' })]);
      for (const field of ['password', 'email', 'roles']) {
        config['ngdpbase.access.subject-attributes'] = { secret: { type: 'string', from: `account:${field}` } };
        expect(evaluator.conditionProblemsInForce()[0].problems).toEqual([`'account:${field}' cannot be used in a condition`]);
        accounts.quinn = { username: 'quinn', [field]: 'x' };
        expect((await decide(signedIn(1))).permit).toBe(false);
      }
    });

    test('a source that is not a subject source is reported', async () => {
      await boot([policy('qa-x', 'allow', ['page-edit'], { attribute: 'subject:x', equals: 'x' })]);
      config['ngdpbase.access.subject-attributes'] = { x: { type: 'string', from: 'frontmatter:author' } };
      expect(evaluator.conditionProblemsInForce()[0].problems[0]).toMatch(/reads from "frontmatter:author"; start it with account:, profile:, sign-in/);
    });
  });

  test('subject:id still works when a site\'s own subject-attributes does not declare it', async () => {
    await boot([policy('qa-own', 'allow', ['page-edit'], { attribute: 'resource:owner', equals: 'subject:id' })]);
    config['ngdpbase.access.subject-attributes'] = {};
    expect(evaluator.conditionProblemsInForce()).toEqual([]);
    expect((await decide({ ...signedIn(1), username: 'system' })).permit).toBe(true);
    expect((await decide(signedIn(1))).permit).toBe(false);
  });
});
