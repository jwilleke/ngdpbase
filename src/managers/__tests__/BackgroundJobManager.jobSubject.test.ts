/**
 * #1999: a scheduled job holds its own permissions (operator, 2026-10-22).
 *
 * The accounting case end to end: `accounting-dues.issue-invoices` needs
 * `invoice-issue` and `ledger-read`, and admin deliberately lacks ledger
 * access. With the job's own policy:
 *
 * - its scheduled run acts as the job: it holds those two and nothing of the
 *   system principal's admin roles, and every audit row names the job;
 * - "Run now" acts as the admin who clicked, so an admin without ledger
 *   access is refused, as the decision says it must be;
 * - a job no policy names keeps the system principal's roles, as before.
 *
 * BackgroundJobManager, the PDP, the PIP and the evaluator are real; only
 * configuration, the account store and the audit sink are tables. State lives
 * in a temporary directory removed by each test (only that directory).
 */
vi.unmock('../BackgroundJobManager');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BackgroundJobManager, { type JobRunContext } from '../BackgroundJobManager';
import FileJobStateProvider from '../../providers/FileJobStateProvider';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import PolicyEvaluator from '../PolicyEvaluator';
import { jobContextFromRequest } from '../../context/JobContext';

const JOB = 'accounting-dues.issue-invoices';
const jobPolicy = {
  id: 'accounting-dues-issue-invoices-job', name: 'Issue invoices job', priority: 90, effect: 'allow',
  subjects: [{ type: 'job', value: JOB }], resources: [{ type: 'page', pattern: '*' }], actions: ['invoice-issue', 'ledger-read']
};
const adminPolicy = {
  id: 'admin-everything', name: 'Admin', priority: 50, effect: 'allow',
  subjects: [{ type: 'role', value: 'admin' }], resources: [{ type: 'page', pattern: '*' }], actions: ['admin-system', 'invoice-issue']
};

let dir: string;
let clock: number;
let settings: Record<string, unknown>;
let events: Array<Record<string, any>>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1999-'));
  clock = Date.parse('2026-10-31T23:00:00Z');
  events = [];
  settings = {
    'ngdpbase.system.principal': 'svc',
    'ngdpbase.system.roles': ['admin'],
    'ngdpbase.access.policies.enabled': true,
    'ngdpbase.access.policies': [jobPolicy, adminPolicy],
    'ngdpbase.access.resource-types': { page: {}, 'system-category': {}, vault: {} }
  };
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function site() {
  const accounts: Record<string, string[]> = { ada: ['admin'] };
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: (k: string, d: unknown) => (k in settings ? settings[k] : d) },
    UserManager: { getUser: async (u: string) => (accounts[u] ? { username: u, isActive: true } : null) },
    RoleManager: { resolveUserRoles: async (_ctx: unknown, u: string) => accounts[u] ?? [] },
    AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { events.push(e); return Promise.resolve('id'); } }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null } as never;
  const evaluator = new PolicyEvaluator(engine);
  managers.PolicyEvaluator = evaluator;
  managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
  managers.PolicyInformationPoint = new PolicyInformationPoint(engine);
  await evaluator.initialize();
  const jobs = new BackgroundJobManager(engine, { stateProvider: new FileJobStateProvider(path.join(dir, 'jobs'), { now: () => clock }), now: () => new Date(clock) });
  const pdp = managers.PolicyDecisionPoint as PolicyDecisionPoint;
  const held: Array<Record<string, boolean>> = [];
  const contexts: JobRunContext[] = [];
  jobs.registerJob({
    id: JOB,
    displayName: 'Issue invoices',
    schedule: 'start-of-month 00:00',
    run: async (_progress, ctx) => {
      contexts.push(ctx);
      held.push({
        'invoice-issue': await pdp.permits(ctx, 'invoice-issue'),
        'ledger-read': await pdp.permits(ctx, 'ledger-read'),
        'admin-system': await pdp.permits(ctx, 'admin-system')
      });
      return { success: true };
    }
  });
  return { jobs, held, contexts };
}

async function runScheduledSlot(jobs: BackgroundJobManager): Promise<void> {
  await jobs.tick();
  clock = Date.parse('2026-11-01T00:00:05Z');
  await jobs.tick();
  await jobs.whenIdle();
}

describe('a scheduled run acts as the job (#1999)', () => {
  test('it holds exactly its two permissions, and none of the system principal\'s', async () => {
    const { jobs, held } = await site();
    await runScheduledSlot(jobs);
    expect(held).toEqual([{ 'invoice-issue': true, 'ledger-read': true, 'admin-system': false }]);
  });

  test('its context names the job; the run\'s audit rows name the job and its slot', async () => {
    const { jobs, contexts } = await site();
    await runScheduledSlot(jobs);
    expect(contexts[0]).toMatchObject({ username: 'svc', origin: 'schedule', job: JOB, slot: '2026-11-01T00:00:00.000Z' });
    const started = events.find((e) => e.eventType === 'job-started');
    expect(started?.metadata).toMatchObject({ jobId: JOB, job: JOB, slot: '2026-11-01T00:00:00.000Z' });
  });

  test('a job no policy names keeps the system principal\'s roles, as before', async () => {
    settings['ngdpbase.access.policies'] = [adminPolicy];
    const { jobs, held } = await site();
    await runScheduledSlot(jobs);
    expect(held).toEqual([{ 'invoice-issue': true, 'ledger-read': false, 'admin-system': true }]);
  });
});

describe('"Run now" acts as the admin who clicked (#1999)', () => {
  test('with their own permissions: an admin without ledger access is refused it', async () => {
    const { jobs, held, contexts } = await site();
    await jobs.tick();
    await jobs.runNow(JOB, jobContextFromRequest({ username: 'ada' }));
    await jobs.whenIdle();
    expect(contexts[0].job).toBeUndefined();
    expect(contexts[0].username).toBe('ada');
    expect(held).toEqual([{ 'invoice-issue': true, 'ledger-read': false, 'admin-system': true }]);
  });
});
