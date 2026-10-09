/**
 * #1718 — the scheduled-jobs routes: permission at the door, the action
 * handed to the manager as the person asking, a refusal from the manager
 * answered with its status, and the form answered by going back to the page.
 */
import WikiRoutes from '../WikiRoutes';
import { JobActionError } from '../../managers/BackgroundJobManager';

const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis()
});

/** `granted` is every permission the signed-in person has; the PDP double answers from it alone. */
function routes(granted: string[]) {
  const jobs = {
    runNow: vi.fn().mockResolvedValue('run-1'),
    rerunSlot: vi.fn().mockResolvedValue('run-2'),
    retryNow: vi.fn().mockResolvedValue(undefined),
    listScheduledJobs: vi.fn().mockResolvedValue([{ id: 'test.hourly' }])
  };
  const config = { getProperty: (_k: string, d: unknown) => d, setProperty: vi.fn().mockResolvedValue(undefined) };
  const managers: Record<string, unknown> = {
    BackgroundJobManager: jobs,
    ConfigurationManager: config,
    PolicyDecisionPoint: {
      permits: vi.fn((_subject: unknown, action: string) => Promise.resolve(granted.includes(action))),
      holds: vi.fn((_subject: unknown, action: string) => Promise.resolve(granted.includes(action)))
    },
    AuditManager: { logAuditEvent: vi.fn().mockResolvedValue('a') },
    AuthManager: { stepUpNeeded: vi.fn(() => false), requiredAalFor: vi.fn(() => 1) }
  };
  const engine = { getManager: vi.fn((n: string) => managers[n] ?? null) };
  const r = new WikiRoutes(engine) as unknown as {
    scheduledJobAction(q: unknown, s: unknown, a: string): Promise<void>;
    apiScheduledJobs(q: unknown, s: unknown): Promise<void>;
  };
  return { r, jobs, config };
}

const req = (path: string, extra: Record<string, unknown> = {}) => ({
  session: { username: 'jim', isAuthenticated: true }, body: {}, ip: '1.2.3.4', headers: {}, query: {},
  params: { jobId: 'test.hourly' }, method: 'POST', path, originalUrl: path,
  get: () => 'ua',
  userContext: { username: 'jim', roles: ['admin'], isAuthenticated: true },
  ...extra
});

describe('scheduled-job routes (#1718)', () => {
  test('without admin-system, run now is refused and the job is not touched', async () => {
    const { r, jobs } = routes(['page-read']);
    const out = res();
    await r.scheduledJobAction(req('/api/admin/jobs/test.hourly/run-now'), out, 'run-now');
    expect(out.status).toHaveBeenCalledWith(403);
    expect(jobs.runNow).not.toHaveBeenCalled();
  });

  test('with admin-system, run now goes to the manager as the person asking', async () => {
    const { r, jobs } = routes(['admin-system']);
    const out = res();
    await r.scheduledJobAction(req('/api/admin/jobs/test.hourly/run-now'), out, 'run-now');
    expect(jobs.runNow).toHaveBeenCalledWith('test.hourly', expect.objectContaining({ username: 'jim', origin: 'request', reason: 'admin: run-now test.hourly' }));
    expect(out.status).toHaveBeenCalledWith(202);
    expect(out.json).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1' }));
  });

  test('rerun passes the slot; a refusal from the manager is answered with its status', async () => {
    const { r, jobs } = routes(['admin-system']);
    jobs.rerunSlot.mockRejectedValueOnce(new JobActionError('already completed', 409));
    const out = res();
    await r.scheduledJobAction(req('/api/admin/jobs/test.hourly/rerun', { body: { slot: '2026-10-09T11:00:00.000Z' } }), out, 'rerun');
    expect(jobs.rerunSlot).toHaveBeenCalledWith('test.hourly', '2026-10-09T11:00:00.000Z', expect.objectContaining({ username: 'jim' }));
    expect(out.status).toHaveBeenCalledWith(409);
    expect(out.json).toHaveBeenCalledWith({ error: 'already completed' });
  });

  test('pause is a configuration change: admin-system alone is not enough', async () => {
    const { r, config } = routes(['admin-system']);
    const out = res();
    await r.scheduledJobAction(req('/api/admin/jobs/test.hourly/pause', { body: { paused: 'true' } }), out, 'pause');
    expect(out.status).toHaveBeenCalledWith(403);
    expect(config.setProperty).not.toHaveBeenCalled();
  });

  test('with config-manage, pause writes the job\'s enabled switch, as the person asking', async () => {
    const { r, config } = routes(['config-manage']);
    const out = res();
    await r.scheduledJobAction(req('/api/admin/jobs/test.hourly/pause', { body: { paused: 'true' } }), out, 'pause');
    expect(config.setProperty).toHaveBeenCalledWith('ngdpbase.jobs.test.hourly.enabled', false, expect.objectContaining({ username: 'jim' }));
  });

  test('the form goes back to the page with the outcome', async () => {
    const { r } = routes(['admin-system']);
    const out = res();
    await r.scheduledJobAction(req('/admin/jobs/test.hourly/retry'), out, 'retry');
    expect(out.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/jobs\?success=/));
  });

  test('the list needs admin read access', async () => {
    const { r, jobs } = routes(['page-read']);
    const out = res();
    await r.apiScheduledJobs(req('/api/admin/jobs/scheduled', { method: 'GET' }), out);
    expect(out.status).toHaveBeenCalledWith(403);
    expect(jobs.listScheduledJobs).not.toHaveBeenCalled();
  });
});
