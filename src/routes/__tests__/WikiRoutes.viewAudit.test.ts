/**
 * #1129 — page-read is a deployment posture, not a default.
 *
 * On a wiki, auditing every page view is volume without value. On a PHR-style
 * deployment, who looked at what is the single most important audit question.
 * So the emitter exists unconditionally (the parity tests hold it) and the
 * `enabled` switch on `page-read` in `ngdpbase.audit.events` decides at runtime
 * whether it fires (#1203) — false by default, so nothing changes for existing
 * deployments.
 */
import fs from 'fs';
import path from 'path';
import WikiRoutes from '../WikiRoutes';
import { AUDIT_EVENTS_KEY, bindAuditEvents } from '../../utils/auditRegistry';

const shipped = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')) as Record<string, unknown>;
const shippedEvents = shipped[AUDIT_EVENTS_KEY] as Record<string, Record<string, unknown>>;

/** Bind the shipped map with `page-read` switched as the test asks. */
function bindPageRead(enabled: boolean): void {
  const events = { ...shippedEvents, 'page-read': { ...shippedEvents['page-read'], enabled } };
  bindAuditEvents((key, d) => (key === AUDIT_EVENTS_KEY ? events : d));
}

afterEach(() => bindAuditEvents((key, d) => (key === AUDIT_EVENTS_KEY ? shippedEvents : d)));

const user = { username: 'jim', isAuthenticated: true, roles: ['reader'] };

const makeReq = () => ({
  params: {}, query: {}, body: {}, ip: '10.0.0.1',
  session: { csrfToken: 't' }, path: '/', originalUrl: '/', protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: user
});

function makeRoutes(readEvents: boolean) {
  bindPageRead(readEvents);
  const audit = {
    logAuditEvent: vi.fn().mockResolvedValue('id'),
    flushAuditQueue: vi.fn().mockResolvedValue(undefined)
  };
  const config = {
    getProperty: vi.fn((_key: string, fallback: unknown) => fallback)
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

describe('#1129 page-read emission follows the enabled switch (#1203)', () => {
  test('shipped default: page-read is switched off', () => {
    expect(shippedEvents['page-read'].enabled).toBe(false);
  });

  test('off: the switch closed means no record, and the route asks no other key', async () => {
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
    expect(event.eventType).toBe('page-read');
    expect(event.user).toBe('jim');
    expect(event.metadata).toMatchObject({ pageName: 'Lab Results', uuid: 'uuid-1' });
  });
});
