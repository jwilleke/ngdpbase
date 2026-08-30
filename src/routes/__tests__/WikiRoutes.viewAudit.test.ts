/**
 * #1129 — page.view is a deployment posture, not a default.
 *
 * On a wiki, auditing every page view is volume without value. On a PHR-style
 * deployment, who looked at what is the single most important audit question.
 * So the emitter exists unconditionally (the #1120 registry declares the type,
 * the parity tests hold it) and `ngdpbase.audit.read-events` decides at runtime
 * whether it fires — false by default, so nothing changes for existing
 * deployments.
 */
import WikiRoutes from '../WikiRoutes';

const user = { username: 'jim', isAuthenticated: true, roles: ['reader'] };

const makeReq = () => ({
  params: {}, query: {}, body: {}, ip: '10.0.0.1',
  session: { csrfToken: 't' }, path: '/', originalUrl: '/', protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: user
});

function makeRoutes(readEvents: boolean) {
  const audit = {
    logAuditEvent: vi.fn().mockResolvedValue('id'),
    flushAuditQueue: vi.fn().mockResolvedValue(undefined)
  };
  const config = {
    getProperty: vi.fn((key: string, fallback: unknown) =>
      key === 'ngdpbase.audit.read-events' ? readEvents : fallback
    )
  };
  const engine = {
    getManager: vi.fn((name: string) =>
      name === 'AuditManager' ? audit : name === 'ConfigurationManager' ? config : null
    )
  };
  const routes = new WikiRoutes(engine) as unknown as {
    auditPageView: (req: unknown, pageName: string, uuid: string | null | undefined) => void;
  };
  return { routes, audit };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('#1129 page.view emission follows the read-events gate', () => {
  test('off by default: the gate closed means no record', async () => {
    const { routes, audit } = makeRoutes(false);
    routes.auditPageView(makeReq(), 'Lab Results', 'uuid-1');
    await settle();
    expect(audit.logAuditEvent).not.toHaveBeenCalled();
  });

  test('gate open: one record naming who saw what', async () => {
    const { routes, audit } = makeRoutes(true);
    routes.auditPageView(makeReq(), 'Lab Results', 'uuid-1');
    await settle();
    expect(audit.logAuditEvent).toHaveBeenCalledOnce();
    const event = audit.logAuditEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(event.eventType).toBe('page.view');
    expect(event.user).toBe('jim');
    expect(event.metadata).toMatchObject({ pageName: 'Lab Results', uuid: 'uuid-1' });
  });
});
