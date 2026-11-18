/**
 * The worked example's "How it decides" table (#2261, slice 6), seven rows.
 *
 * Run against the SHIPPED configuration plus the page-based worked example
 * (`__fixtures__/projectDocumentsConfig.ts`), with a real PolicyEvaluator,
 * PolicyDecisionPoint and PolicyInformationPoint and an injected clock. The
 * only fakes are the account record (the department comes from the profile)
 * and the step-up rule, which says a fresh factor is needed to approve.
 * Sabotage check: turn `project-document-approve-guard` into an allow, or drop
 * its `or` branch on `subject:aal`, and rows 4 and 5 go red.
 */
import fs from 'fs';
import path from 'path';
import PolicyInformationPoint from '../PolicyInformationPoint';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import PolicyValidator from '../../managers/PolicyValidator';
import { projectDocumentsConfig } from '../../managers/__tests__/__fixtures__/projectDocumentsConfig';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

const TUESDAY_10 = new Date('2026-03-10T14:00:00Z'); // 10:00 New York
const SATURDAY_10 = new Date('2026-03-14T14:00:00Z');

const doc = (department?: string) => ({
  title: 'Plan', uuid: 'u1', lastModified: '', author: 'someone-else', 'system-category': 'project-document',
  ...(department ? { department } : {})
});
const signedIn = (username: string, roles: string[], aal: number, extra: Record<string, unknown> = {}) =>
  ({ username, roles, isAuthenticated: true, signIn: { provider: 'password', factors: [], at: '2026-03-10T13:59:00Z', aal, ...extra } });

describe('project documents: how it decides (#2261 slice 6, page-based worked example)', () => {
  let pip: PolicyInformationPoint;
  let pdp: PolicyDecisionPoint;
  let now: Date;
  let accounts: Record<string, Record<string, unknown>>;
  let config: Record<string, unknown>;

  beforeEach(async () => {
    now = TUESDAY_10;
    accounts = {
      eve: { department: 'engineering' },
      sam: { department: 'sales' },
      lena: { department: 'engineering' },
      nodept: {}
    };
    config = projectDocumentsConfig(shipped);
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def), getUnresolvedProperty: (key: string, def: unknown) => (key in config ? config[key] : def) },
      ValidationManager: { getDefaultSystemCategory: () => 'general' },
      AuditManager: { logAuditEvent: () => Promise.resolve() },
      UserManager: { getUser: (name: string) => Promise.resolve(accounts[name]) },
      // Approving needs a factor from the last few minutes, as `"step-up": true` says.
      AuthManager: { stepUpNeeded: (permission: string, signIn?: { freshFactor?: boolean }) => permission === 'document-approve' && !signIn?.freshFactor },
      PageManager: { checkPrivatePageAccess: () => Promise.resolve(null) }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    const evaluator = new PolicyEvaluator(engine);
    pdp = new PolicyDecisionPoint(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = pdp;
    await evaluator.initialize();
    pip = new PolicyInformationPoint(engine, () => now);
    await pip.initialize();
    managers.PolicyInformationPoint = pip;
  });

  const ask = (subject: unknown, action: string, metadata: Record<string, unknown>) =>
    pdp.decide(subject, { action, resource: { type: 'page', id: 'Plan' }, pageMetadata: metadata });
  const both = async (subject: unknown, metadata: Record<string, unknown>) =>
    ({ read: await ask(subject, 'page-read', metadata), approve: await ask(subject, 'document-approve', metadata) });

  test('the fixture is a valid configuration: no problem in any policy', async () => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def), getUnresolvedProperty: (key: string, def: unknown) => (key in config ? config[key] : def) },
      ValidationManager: { getDefaultSystemCategory: () => 'general' }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    const evaluator = new PolicyEvaluator(engine);
    managers.PolicyEvaluator = evaluator;
    await evaluator.initialize();
    const validator = new PolicyValidator(engine);
    await validator.initialize();
    expect(evaluator.conditionProblemsInForce()).toEqual([]);
    expect(validator.policyProblems(config['ngdpbase.access.policies'])).toEqual([]);
  });

  test('1. an Engineering member reads an Engineering document and cannot approve it (no allow)', async () => {
    const r = await both(signedIn('eve', ['member'], 2), doc('engineering'));
    expect(r.read).toMatchObject({ permit: true, policyIds: ['project-document-read-department'] });
    expect(r.approve).toMatchObject({ permit: false, policyIds: [] });
  });

  test('2. a Sales member can neither read nor approve an Engineering document: no policy decides', async () => {
    const r = await both(signedIn('sam', ['member', 'project-lead'], 2), doc('engineering'));
    expect(r.read).toMatchObject({ permit: false, policyIds: [] });
    expect(r.approve).toMatchObject({ permit: false, policyIds: [] });
  });

  test('3. an Engineering lead at AAL 2 on Tuesday 10:00 reads, and approves after a fresh factor', async () => {
    const lead = signedIn('lena', ['project-lead'], 2);
    const stale = await both(lead, doc('engineering'));
    expect(stale.read).toMatchObject({ permit: true, policyIds: ['project-document-read-department'] });
    expect(stale.approve.permit).toBe(false); // step-up: no fresh factor yet
    expect(stale.approve.policyIds).toEqual([]);
    const fresh = await both(signedIn('lena', ['project-lead'], 2, { freshFactor: true }), doc('engineering'));
    expect(fresh.approve).toMatchObject({ permit: true, policyIds: ['project-document-approve'] });
  });

  test('4. an Engineering lead at AAL 2 on Saturday reads and is refused approval by the guard', async () => {
    now = SATURDAY_10;
    const r = await both(signedIn('lena', ['project-lead'], 2, { freshFactor: true }), doc('engineering'));
    expect(r.read).toMatchObject({ permit: true, policyIds: ['project-document-read-department'] });
    expect(r.approve).toMatchObject({ permit: false, policyIds: ['project-document-approve-guard'] });
  });

  test('5. an Engineering lead at AAL 1 on Tuesday 10:00 reads and is refused approval by the guard', async () => {
    const r = await both(signedIn('lena', ['project-lead'], 1, { freshFactor: true }), doc('engineering'));
    expect(r.read).toMatchObject({ permit: true, policyIds: ['project-document-read-department'] });
    expect(r.approve).toMatchObject({ permit: false, policyIds: ['project-document-approve-guard'] });
  });

  test('6. a document with no department: the allow cannot apply, so neither read nor approve', async () => {
    const r = await both(signedIn('lena', ['project-lead'], 2, { freshFactor: true }), doc());
    expect(r.read).toMatchObject({ permit: false, policyIds: [] });
    expect(r.approve).toMatchObject({ permit: false, policyIds: [] });
  });

  test('7. a lead whose profile has no department: neither read nor approve', async () => {
    const r = await both(signedIn('nodept', ['project-lead'], 2, { freshFactor: true }), doc('engineering'));
    expect(r.read).toMatchObject({ permit: false, policyIds: [] });
    expect(r.approve).toMatchObject({ permit: false, policyIds: [] });
  });

  test('the page list gives the same read answer as the door in every row', async () => {
    const rows: Array<[string, unknown, Record<string, unknown>]> = [
      ['eve', signedIn('eve', ['member'], 2), doc('engineering')],
      ['sam', signedIn('sam', ['member'], 2), doc('engineering')],
      ['lena', signedIn('lena', ['project-lead'], 2), doc('engineering')],
      ['no department on the page', signedIn('lena', ['project-lead'], 2), doc()],
      ['no department in the profile', signedIn('nodept', ['project-lead'], 2), doc('engineering')]
    ];
    for (const [label, subject, metadata] of rows) {
      const listed = await pip.filterAccessiblePages(subject, 'view', [{ title: 'Plan', metadata }]);
      const door = await ask(subject, 'page-read', metadata);
      expect(listed.includes('Plan'), label).toBe(door.permit);
    }
  });
});
