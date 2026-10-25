/**
 * #1999: a scheduled job holds its own permissions (operator, 2026-10-22, option A).
 *
 * - A policy names a job as `{ "type": "job", "value": "<job id>" }`, and the
 *   evaluator matches it (it matched `role` alone before);
 * - a scheduled run acts as the job: when a policy names it, the run's
 *   subject is `job:<id>` with no roles, so it holds what those policies grant
 *   and nothing of the system principal's;
 * - a job no policy names keeps the system principal's roles, as before;
 * - only the system principal's context can act as a job, so a request's
 *   context naming a job decides with the user's own roles.
 *
 * The PDP, the PIP and the evaluator are real; only configuration is a table.
 */
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import PolicyInformationPoint from '../PolicyInformationPoint';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import { jobContextFromSchedule, jobContextFromRequest, type JobContext } from '../../context/JobContext';

const JOB = 'accounting-dues.issue-invoices';

const jobPolicy = {
  id: 'accounting-dues-issue-invoices-job',
  name: 'Issue invoices job',
  priority: 90,
  effect: 'allow',
  subjects: [{ type: 'job', value: JOB }],
  resources: [{ type: 'page', pattern: '*' }],
  actions: ['invoice-issue', 'ledger-read']
};
const adminPolicy = {
  id: 'admin-everything',
  name: 'Admin',
  priority: 50,
  effect: 'allow',
  subjects: [{ type: 'role', value: 'admin' }],
  resources: [{ type: 'page', pattern: '*' }],
  actions: ['admin-system', 'invoice-issue']
};

async function build(policies: unknown[]) {
  const settings: Record<string, unknown> = {
    'ngdpbase.system.principal': 'svc',
    'ngdpbase.system.roles': ['admin'],
    'ngdpbase.access.policies.enabled': true,
    'ngdpbase.access.policies': policies,
    'ngdpbase.access.resource-types': { page: {}, 'system-category': {}, vault: {} }
  };
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: (k: string, d: unknown) => (k in settings ? settings[k] : d) },
    // An account store with nobody in it: the job principal is no account.
    UserManager: { getUser: async () => null }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null } as never;
  const evaluator = new PolicyEvaluator(engine);
  managers.PolicyEvaluator = evaluator;
  managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
  managers.PolicyInformationPoint = new PolicyInformationPoint(engine);
  await evaluator.initialize();
  return { pdp: managers.PolicyDecisionPoint as PolicyDecisionPoint, pip: managers.PolicyInformationPoint as PolicyInformationPoint, settings };
}

/** The context a scheduled slot of the job runs under, as BackgroundJobManager builds it. */
const scheduledRun = (): JobContext => ({ ...jobContextFromSchedule('svc', 'slot 2026-11-01T05:00:00.000Z'), job: JOB });

describe('a job named by a policy acts as itself (#1999)', () => {
  test('it holds exactly what its policy grants', async () => {
    const { pdp } = await build([jobPolicy, adminPolicy]);
    expect(await pdp.permits(scheduledRun(), 'invoice-issue')).toBe(true);
    expect(await pdp.permits(scheduledRun(), 'ledger-read')).toBe(true);
  });

  test('and nothing of the system principal\'s roles', async () => {
    const { pdp } = await build([jobPolicy, adminPolicy]);
    expect(await pdp.permits(scheduledRun(), 'admin-system')).toBe(false);
  });

  test('its subject is job:<id>, with no roles', async () => {
    const { pip } = await build([jobPolicy]);
    expect(await pip.resolveSubjectNow('svc', JOB)).toEqual({ username: `job:${JOB}`, roles: [], isAuthenticated: true, job: JOB });
  });

  test('a page question answers for the job too, not for the system principal', async () => {
    const { pip } = await build([jobPolicy, adminPolicy]);
    expect((await pip.resolveSubjectNow('svc', JOB)).roles).toEqual([]);
  });
});

describe('a job no policy names keeps the system principal\'s roles (#1999)', () => {
  test('as before: admin, by ngdpbase.system.roles', async () => {
    const { pdp } = await build([adminPolicy]);
    expect(await pdp.permits(scheduledRun(), 'admin-system')).toBe(true);
    expect(await pdp.permits(scheduledRun(), 'ledger-read')).toBe(false);
  });

  test('a policy naming another job does not make this one its own subject', async () => {
    const { pdp } = await build([{ ...jobPolicy, subjects: [{ type: 'job', value: 'other.job' }] }, adminPolicy]);
    expect(await pdp.permits(scheduledRun(), 'admin-system')).toBe(true);
    expect(await pdp.permits(scheduledRun(), 'ledger-read')).toBe(false);
  });

  test('a site that removes the job\'s policy gives it the system roles back, at the next decision', async () => {
    const { pdp, settings } = await build([jobPolicy, adminPolicy]);
    expect(await pdp.permits(scheduledRun(), 'admin-system')).toBe(false);
    settings['ngdpbase.access.policies'] = [adminPolicy];
    expect(await pdp.permits(scheduledRun(), 'admin-system')).toBe(true);
  });
});

describe('only the system principal acts as a job (#1999)', () => {
  test('a request\'s context naming a job decides with that user\'s own roles, never the job\'s grants', async () => {
    const { pdp } = await build([jobPolicy]);
    const forged = { ...jobContextFromRequest({ username: 'mallory' }), job: JOB };
    expect(await pdp.permits(forged, 'ledger-read')).toBe(false);
  });

  test('a role policy never matches a job, and a job policy never matches a role', async () => {
    const { pdp } = await build([jobPolicy, adminPolicy]);
    const admin = { username: 'ada', roles: ['admin'], isAuthenticated: true };
    expect(await pdp.permits(admin as never, 'ledger-read')).toBe(false);
  });
});
