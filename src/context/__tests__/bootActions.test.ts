/**
 * #1197 — boot actions are attributed: the system principal, origin `boot`,
 * a stated reason. Recorded now when the audit sink is up; held in the boot
 * ledger and flushed by `AuditManager.initialize` when it is not.
 */
import {
  attributedTo, drainBootActions, pendingBootActions, recordSystemAction, resetBootActions,
  scheduleContext, systemContext, systemPrincipalOf
} from '../bootActions';

const sinkWith = (events: unknown[]) => ({
  logAuditEvent: vi.fn(async (e: unknown) => { events.push(e); return 'evt'; }),
  flushAuditQueue: vi.fn(async () => undefined)
});
const engineWith = (managers: Record<string, unknown>) => ({ getManager: (n: string) => managers[n] ?? null });
const userManager = { systemPrincipalName: () => 'svc-ngdpbase' };

beforeEach(() => resetBootActions());

describe('systemContext (#1197)', () => {
  test('names the principal from .env (#631), origin boot, and the reason', () => {
    const ctx = systemContext(engineWith({ UserManager: userManager }), 'seed the required pages');
    expect(ctx).toMatchObject({ username: 'svc-ngdpbase', origin: 'boot', reason: 'seed the required pages' });
    expect(scheduleContext(engineWith({ UserManager: userManager }), 'tick').origin).toBe('schedule');
  });

  test('falls back to the literal only where no UserManager answers — a fixture, never a booted instance', () => {
    expect(systemPrincipalOf(engineWith({}))).toBe('system');
    expect(systemPrincipalOf(engineWith({ UserManager: { systemPrincipalName: () => { throw new Error('unset'); } } }))).toBe('system');
    expect(systemPrincipalOf(null)).toBe('system');
  });

  test('attributedTo carries who, from where and why into the record', () => {
    const ctx = systemContext(engineWith({ UserManager: userManager }), 'why');
    expect(attributedTo(ctx)).toMatchObject({ user: 'svc-ngdpbase', metadata: { origin: 'boot', reason: 'why' } });
  });
});

describe('recordSystemAction (#1197)', () => {
  const event = { eventType: 'page-create', action: 'create', resource: 'Welcome', resourceType: 'page', result: 'success', severity: 'low', metadata: { seed: 'required-pages' } } as const;

  test('with the sink up, records immediately and stamps the attribution', async () => {
    const events: Array<Record<string, unknown>> = [];
    const engine = engineWith({ UserManager: userManager, AuditManager: sinkWith(events) });
    await recordSystemAction(engine, systemContext(engine, 'seed'), event);
    expect(pendingBootActions()).toHaveLength(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'page-create', user: 'svc-ngdpbase', metadata: { origin: 'boot', reason: 'seed', seed: 'required-pages' } });
  });

  test('with no sink yet, waits in the ledger and is flushed once, in order', async () => {
    const engine = engineWith({ UserManager: userManager });
    const ctx = systemContext(engine, 'seed');
    await recordSystemAction(engine, ctx, { ...event, resource: 'First' });
    await recordSystemAction(engine, ctx, { ...event, resource: 'Second' });
    expect(pendingBootActions().map((p) => p.event.resource)).toEqual(['First', 'Second']);

    const events: Array<Record<string, unknown>> = [];
    expect(await drainBootActions(sinkWith(events) as never)).toBe(2);
    expect(events.map((e) => e.resource)).toEqual(['First', 'Second']);
    expect(events[0]).toMatchObject({ user: 'svc-ngdpbase', metadata: { origin: 'boot' } });
    expect(pendingBootActions()).toHaveLength(0);
    expect(await drainBootActions(sinkWith(events) as never)).toBe(0);   // nothing recorded twice
  });

  test('the event\'s own metadata wins over the attribution on a key collision', async () => {
    const engine = engineWith({ UserManager: userManager });
    await recordSystemAction(engine, systemContext(engine, 'seed'), { ...event, metadata: { origin: 'custom' } });
    expect(pendingBootActions()[0].event.metadata.origin).toBe('custom');
  });
});
