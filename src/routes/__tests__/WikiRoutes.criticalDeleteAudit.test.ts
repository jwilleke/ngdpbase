/**
 * #1121 — a delete whose audit record cannot be written must not happen.
 *
 * page-delete and asset-delete are declared critical in the #1120
 * registry. Destruction with no record of what was destroyed is the one
 * outcome an audit log exists to prevent, and unlike a page edit it cannot be
 * reconstructed afterwards.
 *
 * Both paths already audited BEFORE the destructive act — #946 established
 * that for pages — but the failure was swallowed, so a broken audit backend
 * let the delete proceed unrecorded. It now refuses.
 */
import WikiRoutes from '../WikiRoutes';

const user = { username: 'jim', isAuthenticated: true, roles: ['admin'] };

const makeReq = (params: Record<string, string> = {}) => ({
  params, query: {}, body: {}, ip: '10.0.0.1',
  session: { csrfToken: 't' }, path: '/', originalUrl: '/', protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: user
});


/** A sink that can flush but always fails the write. */
const brokenAudit = () => ({
  logAuditEvent: vi.fn().mockRejectedValue(new Error('audit disk full')),
  flushAuditQueue: vi.fn().mockResolvedValue(undefined)
});

describe('#1121 a delete refuses when its audit record cannot be written', () => {
  test('auditPageDelete rejects rather than swallowing, so the caller can abandon', async () => {
    const engine = {
      getManager: vi.fn((name: string) => (name === 'AuditManager' ? brokenAudit() : null))
    };
    const routes = new WikiRoutes(engine) as unknown as {
      auditPageDelete: (req: unknown, ctx: unknown, name: string, uuid: string) => Promise<void>;
    };

    await expect(
      routes.auditPageDelete(makeReq(), { userContext: user }, 'Secret Page', 'uuid-1')
    ).rejects.toThrow(/critical/i);
  });

  test('a working sink resolves, and the record names what is about to be destroyed', async () => {
    const audit = {
      logAuditEvent: vi.fn().mockResolvedValue('id'),
      flushAuditQueue: vi.fn().mockResolvedValue(undefined)
    };
    const engine = {
      getManager: vi.fn((name: string) => (name === 'AuditManager' ? audit : null))
    };
    const routes = new WikiRoutes(engine) as unknown as {
      auditPageDelete: (req: unknown, ctx: unknown, name: string, uuid: string) => Promise<void>;
    };

    await routes.auditPageDelete(makeReq(), { userContext: user }, 'Secret Page', 'uuid-1');

    const event = audit.logAuditEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(event.eventType).toBe('page-delete');
    // The name and uuid are the whole point: after the delete they are gone,
    // and an investigator cannot ask "what was that?" of an id alone.
    expect(event.metadata).toMatchObject({ pageName: 'Secret Page', uuid: 'uuid-1' });
  });

  test('it is flushed, not merely queued', async () => {
    // Durable BEFORE the delete. A queue that flushes on a timer is not
    // durability when the next thing that happens is destruction.
    const audit = {
      logAuditEvent: vi.fn().mockResolvedValue('id'),
      flushAuditQueue: vi.fn().mockResolvedValue(undefined)
    };
    const engine = { getManager: vi.fn((n: string) => (n === 'AuditManager' ? audit : null)) };
    const routes = new WikiRoutes(engine) as unknown as {
      auditPageDelete: (req: unknown, ctx: unknown, name: string, uuid: string) => Promise<void>;
    };

    await routes.auditPageDelete(makeReq(), { userContext: user }, 'P', 'u');
    expect(audit.flushAuditQueue).toHaveBeenCalledOnce();
  });

  test('no audit manager at all does not block a delete', async () => {
    // Auditing switched off is a configuration decision, visible through
    // #1118's posture. It must not make deleting impossible.
    const engine = { getManager: vi.fn(() => null) };
    const routes = new WikiRoutes(engine) as unknown as {
      auditPageDelete: (req: unknown, ctx: unknown, name: string, uuid: string) => Promise<void>;
    };
    await expect(
      routes.auditPageDelete(makeReq(), { userContext: user }, 'P', 'u')
    ).resolves.toBeUndefined();
  });

  test('the record does not claim the delete succeeded', async () => {
    // It is written before the delete, so "success" would overstate what is
    // known at the point of writing.
    const audit = {
      logAuditEvent: vi.fn().mockResolvedValue('id'),
      flushAuditQueue: vi.fn().mockResolvedValue(undefined)
    };
    const engine = { getManager: vi.fn((n: string) => (n === 'AuditManager' ? audit : null)) };
    const routes = new WikiRoutes(engine) as unknown as {
      auditPageDelete: (req: unknown, ctx: unknown, name: string, uuid: string) => Promise<void>;
    };

    await routes.auditPageDelete(makeReq(), { userContext: user }, 'P', 'u');
    const event = audit.logAuditEvent.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(event.metadata.outcome).toBe('attempted');
  });
});
