/**
 * AuditManager tests
 *
 * Covers:
 * - initialize() with auditing enabled (falls back to NullAuditProvider)
 * - initialize() with auditing disabled → uses NullAuditProvider
 * - logAuditEvent() with initialized provider
 * - logAuditEvent() throws when provider not initialized
 * - logAccessDecision() builds and logs access event
 * - logPolicyEvaluation() builds and logs policy event
 * - logAuthentication() builds and logs auth event
 * - logSecurityEvent() builds and logs security event
 * - getAuditStats() delegates to provider
 * - shutdown() calls provider shutdown
 *
 * @jest-environment node
 */

import AuditManager from '../AuditManager';
import logger from '../../utils/logger';
import type { WikiEngine } from '../../types/WikiEngine';

function makeConfigManager(overrides: Record<string, unknown> = {}) {
  return {
    getProperty: vi.fn((key: string, dv: unknown) => overrides[key] ?? dv),
    getResolvedDataPath: vi.fn((_key: string, dv: string) => dv)
  };
}

function makeEngine(configOverrides: Record<string, unknown> = {}): WikiEngine {
  const cm = makeConfigManager(configOverrides);
  // #1152: refuse-boot records a blocking condition rather than throwing, so
  // the engine finishes initialising and the repair screens exist.
  const blocking: string[] = [];
  return {
    blockConfiguration: vi.fn((reason: string) => { blocking.push(reason); }),
    getBlockingConditions: () => [...blocking],
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') return cm;
      // #1116: audit queries verify their caller against UserManager. The
      // default harness grants 'root' admin-system so pre-gate tests keep
      // exercising the delegation they were written for.
      if (name === 'UserManager') {
        return {
          userHoldsPermission: vi.fn(async (username: string, permission: string) =>
            username === 'root' && permission === 'admin-system')
        };
      }
      return null;
    })
  };
}

/** #1116: the caller the default harness authorizes. */
const rootCaller = { username: 'root' };

async function makeInitializedManager(configOverrides: Record<string, unknown> = {}): Promise<AuditManager> {
  const engine = makeEngine({
    'ngdpbase.audit.provider': 'nullauditprovider',
    ...configOverrides
  });
  const am = new AuditManager(engine);
  await am.initialize();
  return am;
}

function makeManagerWithMockProvider(): AuditManager {
  const engine = makeEngine();
  const am = new AuditManager(engine);
  const mockProvider = {
    initialize: vi.fn().mockResolvedValue(undefined),
    logAuditEvent: vi.fn().mockResolvedValue('test-event-id'),
    searchAuditLogs: vi.fn().mockResolvedValue({ results: [], total: 0, limit: 100, offset: 0, hasMore: false }),
    getAuditStats: vi.fn().mockResolvedValue({ totalEvents: 0, eventsByType: {}, eventsByResult: {}, eventsBySeverity: {}, eventsByUser: {}, recentActivity: [], securityIncidents: 0 }),
    exportAuditLogs: vi.fn().mockResolvedValue('[]'),
    flush: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isHealthy: vi.fn().mockResolvedValue(true),
    getProviderInfo: vi.fn().mockReturnValue({ name: 'MockProvider', version: '1.0', description: 'test', features: [] })
  };
  (am as unknown as { provider: unknown }).provider = mockProvider;
  return am;
}

describe('AuditManager', () => {
  describe('initialize()', () => {
    test('initializes with NullAuditProvider', async () => {
      const am = await makeInitializedManager();
      expect(am).toBeDefined();
    });

    test('initializes when audit is disabled', async () => {
      const am = await makeInitializedManager({ 'ngdpbase.audit.enabled': false });
      expect(am).toBeDefined();
    });

    test('#1203: says where the retired read-events key went, only when it is still set', async () => {
      vi.mocked(logger.warn).mockClear();
      await makeInitializedManager();
      expect(vi.mocked(logger.warn).mock.calls.filter(([m]) => String(m).includes('read-events'))).toHaveLength(0);

      await makeInitializedManager({ 'ngdpbase.audit.read-events': false });
      const said = vi.mocked(logger.warn).mock.calls.filter(([m]) => String(m).includes('read-events is retired'));
      expect(said).toHaveLength(1);
      expect(String(said[0][0])).toContain('ngdpbase.audit.events["page-read"].enabled');
    });

    test('throws when ConfigurationManager unavailable', async () => {
      const engine = { getManager: vi.fn(() => null) } as unknown as WikiEngine;
      const am = new AuditManager(engine);
      await expect(am.initialize()).rejects.toThrow('AuditManager requires ConfigurationManager');
    });
  });

  describe('logAuditEvent()', () => {
    test('logs event and returns event id', async () => {
      const am = makeManagerWithMockProvider();
      const eventId = await am.logAuditEvent({
        eventType: 'access_decision',
        user: 'alice',
        resource: '/view/Test',
        resourceType: 'page',
        action: 'view',
        result: 'allow',
        severity: 'low'
      });
      expect(typeof eventId).toBe('string');
    });

    test('throws when provider not initialized', async () => {
      const engine = makeEngine();
      const am = new AuditManager(engine);
      // Do not initialize
      await expect(am.logAuditEvent({
        eventType: 'test',
        user: 'test',
        resource: 'test',
        resourceType: 'test',
        action: 'test',
        result: 'test',
        severity: 'low'
      })).rejects.toThrow('Audit provider not initialized');
    });
  });

  describe('logAccessDecision()', () => {
    test('logs access decision event', async () => {
      const am = makeManagerWithMockProvider();
      const ctx = {
        user: { username: 'alice', id: 'u1', roles: ['user'], attributes: {} },
        resource: '/view/TestPage',
        resourceType: 'page',
        action: 'view',
        sessionId: 'sess1',
        ipAddress: '127.0.0.1',
        userAgent: 'Test',
        requestMethod: 'GET',
        requestPath: '/view/TestPage',
        timestamp: new Date().toISOString()
      };
      const eventId = await am.logAccessDecision(ctx, 'allow', 'policy match', null);
      expect(typeof eventId).toBe('string');
    });
  });

  describe('logPolicyEvaluation()', () => {
    test('logs policy evaluation event', async () => {
      const am = makeManagerWithMockProvider();
      const ctx = {
        user: { username: 'bob', id: 'u2', roles: [], attributes: {} },
        resource: '/view/Page',
        resourceType: 'page',
        action: 'edit',
        sessionId: 'sess2',
        ipAddress: '10.0.0.1',
        userAgent: 'Test',
        requestMethod: 'POST',
        requestPath: '/edit/Page',
        timestamp: new Date().toISOString()
      };
      const policies = [{ id: 'p1', name: 'AllowEditors', result: 'allow' }];
      const eventId = await am.logPolicyEvaluation(ctx, policies, 'allow', 5);
      expect(typeof eventId).toBe('string');
    });
  });

  describe('logAuthentication()', () => {
    test('logs authentication event', async () => {
      const am = makeManagerWithMockProvider();
      const ctx = {
        user: { username: 'carol', id: 'u3', roles: [], attributes: {} },
        sessionId: 'sess3',
        ipAddress: '192.168.1.1',
        userAgent: 'Test',
        loginMethod: 'local',
        timestamp: new Date().toISOString()
      };
      const eventId = await am.logAuthentication(ctx, 'success', 'credentials valid');
      expect(typeof eventId).toBe('string');
    });
  });

  describe('logSecurityEvent()', () => {
    test('logs security event', async () => {
      const am = makeManagerWithMockProvider();
      const ctx = {
        user: 'attacker',
        ipAddress: '1.2.3.4',
        userAgent: 'Malicious',
        timestamp: new Date().toISOString()
      };
      const eventId = await am.logSecurityEvent(ctx, 'xss_attempt', 'high', 'XSS in content');
      expect(typeof eventId).toBe('string');
    });
  });

  describe('getAuditStats()', () => {
    test('returns stats object', async () => {
      const am = makeManagerWithMockProvider();
      const stats = await am.getAuditStats({}, rootCaller);
      expect(typeof stats).toBe('object');
    });
  });

  describe('shutdown()', () => {
    test('shuts down without throwing', async () => {
      const am = makeManagerWithMockProvider();
      await expect(am.shutdown()).resolves.not.toThrow();
    });
  });

  describe('searchAuditLogs()', () => {
    test('throws when provider not initialized', async () => {
      const am = new AuditManager(makeEngine());
      await expect(am.searchAuditLogs({}, {}, rootCaller)).rejects.toThrow('not initialized');
    });

    test('delegates to provider when initialized', async () => {
      const am = makeManagerWithMockProvider();
      const result = await am.searchAuditLogs({ username: 'admin' }, { limit: 10 }, rootCaller);
      expect(result).toHaveProperty('results');
    });
  });

  describe('getAuditStats() no-provider path', () => {
    test('throws when provider not initialized', async () => {
      const am = new AuditManager(makeEngine());
      await expect(am.getAuditStats({}, rootCaller)).rejects.toThrow('not initialized');
    });
  });

  describe('exportAuditLogs()', () => {
    test('throws when provider not initialized', async () => {
      const am = new AuditManager(makeEngine());
      await expect(am.exportAuditLogs({}, 'json', rootCaller)).rejects.toThrow('not initialized');
    });

    test('delegates to provider when initialized', async () => {
      const am = makeManagerWithMockProvider();
      const result = await am.exportAuditLogs({}, 'json', rootCaller);
      expect(typeof result).toBe('string');
    });
  });

  describe('flushAuditQueue()', () => {
    test('no-ops when provider not initialized', async () => {
      const am = new AuditManager(makeEngine());
      await expect(am.flushAuditQueue()).resolves.toBeUndefined();
    });

    test('calls provider.flush when initialized', async () => {
      const am = makeManagerWithMockProvider();
      await expect(am.flushAuditQueue()).resolves.toBeUndefined();
    });
  });

  describe('cleanupOldLogs()', () => {
    test('no-ops when provider not initialized', async () => {
      const am = new AuditManager(makeEngine());
      await expect(am.cleanupOldLogs()).resolves.toBeUndefined();
    });

    test('calls provider.cleanup when initialized', async () => {
      const am = makeManagerWithMockProvider();
      await expect(am.cleanupOldLogs()).resolves.toBeUndefined();
    });
  });
});

/**
 * #1118 — a failed audit provider was silently replaced by NullAuditProvider,
 * which discards every event, while the server booted healthy and the admin
 * audit page rendered empty.
 *
 * That is an instance believing it has an audit trail and having none — worse
 * than no audit at all, because the only thing that would have recorded the
 * problem is the thing that failed. The configuration made it reachable rather
 * than theoretical: it advertises full setup for databaseauditprovider and
 * cloudauditprovider, both of which are scaffolds that refuse at initialize().
 *
 * Falling back to inert is right for mail, where somebody notices an unsent
 * message. It is wrong for audit, where the degradation is unobservable.
 *
 * The split (docs/security-posture.md): `ngdpbase.audit.on-failure` ships
 * `continue` and an operator sets `refuse-boot` explicitly — nothing defaults it
 * from a posture label, since #1144 removed the preset. Whichever is set,
 * continue must mark the instance DEGRADED rather than carrying on quietly. It
 * is not about whether the instance keeps running; it is that an instance
 * running without audit must know and say so.
 */
describe('#1118 a failed audit provider is never silent', () => {
  const BROKEN = { 'ngdpbase.audit.provider': 'databaseauditprovider' };

  test('refuse-boot: records a blocking condition naming the provider and the cause', async () => {
    // #1152: it used to reject, which aborted initialize() partway — so the
    // admin screens an operator needed to fix the provider were never
    // registered, and the only route back was the filesystem. The guarantee is
    // unchanged (the instance serves nobody); the delivery is maintenance mode.
    const engine = makeEngine({ ...BROKEN, 'ngdpbase.audit.on-failure': 'refuse-boot' });
    const am = new AuditManager(engine);
    await expect(am.initialize()).resolves.not.toThrow();

    const reasons = (engine as unknown as { getBlockingConditions: () => string[] }).getBlockingConditions();
    expect(reasons.join(' ')).toMatch(/DatabaseAuditProvider/);
    expect(reasons.join(' ')).toMatch(/refuse-boot/);
  });

  test('continue: boots, but the instance is marked degraded', async () => {
    const am = new AuditManager(makeEngine({ ...BROKEN, 'ngdpbase.audit.on-failure': 'continue' }));
    await am.initialize();
    expect(am.isDegraded()).toBe(true);
    expect(am.degradedReason()).toMatch(/DatabaseAuditProvider/);
  });

  test('continue is the shipped default when nothing sets the key', async () => {
    // #1144: no profile supplies this any more. The shipped value IS the
    // effective policy.
    const am = new AuditManager(makeEngine({ ...BROKEN }));
    await am.initialize();
    expect(am.isDegraded()).toBe(true);
  });

  test('an explicitly chosen null provider is NOT degraded', async () => {
    // "Auditing is off" and "auditing is broken" must not look alike. An
    // operator who chooses no audit has made a decision on the record.
    const am = await makeInitializedManager();
    expect(am.isDegraded()).toBe(false);
  });

  test('auditing disabled by configuration is NOT degraded', async () => {
    const am = new AuditManager(makeEngine({ 'ngdpbase.audit.enabled': false }));
    await am.initialize();
    expect(am.isDegraded()).toBe(false);
  });

  test('a healthy provider is not degraded', async () => {
    const am = await makeInitializedManager({ 'ngdpbase.audit.on-failure': 'refuse-boot' });
    expect(am.isDegraded()).toBe(false);
  });

  test('the degraded state is reportable, not just logged', async () => {
    // A log line is not a signal — nobody reads it until an assessor asks for
    // six months of records that do not exist.
    const am = new AuditManager(makeEngine({ ...BROKEN, 'ngdpbase.audit.on-failure': 'continue' }));
    await am.initialize();
    const posture = am.getAuditPosture();
    // The provider NAME is whatever the suite's provider mock reports, so
    // asserting it would test the harness. What matters is that the posture
    // names what was CONFIGURED and admits it is not running.
    expect(posture).toMatchObject({ degraded: true, configured: 'DatabaseAuditProvider' });
    expect(posture.reason).toBeTruthy();
  });
});

/**
 * #1118 follow-up — the shipped config now carries a real value rather than an
 * empty string, because an empty enum means "behaviour decided somewhere you
 * cannot see". That is the same shape as the bug it caused: a value that looks
 * absent but is not.
 *
 * The consequence is that a concrete key can no longer be defaulted by the
 * profile. So the profile becomes a DECLARED INTENT checked against the keys,
 * rather than a hidden override — which is a better answer than the one it
 * replaces, and the same declaration-versus-reality check this codebase has
 * needed everywhere else.
 */
describe('#1144 the on-failure key stands alone', () => {
  // #1118 made the profile a DECLARED INTENT checked against the keys. #1144
  // removed the profile entirely: there is one security posture, the settings
  // the instance is actually running, so this key is read from configuration
  // and nothing else.
  //
  // Nothing was lost in the removal. The preset half was already unreachable
  // in a stock install — app-default-config.json ships a real value here, so
  // the fallback never reached the profile's default. Only the divergence
  // WARNING ran, and it warned about a preset that had not applied.
  test('an explicit key is honoured', async () => {
    const am = new AuditManager(makeEngine({
      'ngdpbase.audit.provider': 'databaseauditprovider',
      'ngdpbase.audit.on-failure': 'continue'
    }));
    await am.initialize();
    expect(am.isDegraded()).toBe(true);
  });

  test('a cleared key falls back to continue, not to a preset', async () => {
    // Empty is how an operator clears a key. With no profile to consult, the
    // shipped default is the only remaining answer — and it is the safe one,
    // since the alternative would be refusing to boot on a blank value.
    const am = new AuditManager(makeEngine({
      'ngdpbase.audit.provider': 'databaseauditprovider',
      'ngdpbase.audit.on-failure': '   '
    }));
    await am.initialize();
    expect(am.isDegraded()).toBe(true);
  });

  test('no profile warning is emitted any more', async () => {
    const warn = vi.spyOn(logger, 'warn');
    warn.mockClear();
    const am = new AuditManager(makeEngine({
      'ngdpbase.audit.on-failure': 'continue',
      'ngdpbase.audit.provider': 'nullauditprovider'
    }));
    await am.initialize();
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('profile='));
  });
});

describe('#1116 audit queries refuse without an admin-system caller', () => {
  function makeEngineWithUsers(grants: Record<string, boolean>, configOverrides: Record<string, unknown> = {}) {
    const cm = makeConfigManager(configOverrides);
    const um = {
      userHoldsPermission: vi.fn(async (username: string, permission: string) =>
        permission === 'admin-system' && grants[username] === true)
    };
    return {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return cm;
        if (name === 'UserManager') return um;
        return null;
      })
    } as unknown as WikiEngine;
  }

  async function makeGatedManager(grants: Record<string, boolean>) {
    const am = new AuditManager(makeEngineWithUsers(grants));
    (am as unknown as { provider: unknown }).provider = {
      searchAuditLogs: vi.fn().mockResolvedValue({ results: [], total: 0, limit: 100, offset: 0, hasMore: false }),
      getAuditStats: vi.fn().mockResolvedValue({ totalEvents: 0 }),
      exportAuditLogs: vi.fn().mockResolvedValue('[]')
    };
    return am;
  }

  test('an admin-system caller gets results', async () => {
    const am = await makeGatedManager({ root: true });
    await expect(am.searchAuditLogs({}, {}, { username: 'root' })).resolves.toBeDefined();
    await expect(am.getAuditStats({}, { username: 'root' })).resolves.toBeDefined();
    await expect(am.exportAuditLogs({}, 'json', { username: 'root' })).resolves.toBeDefined();
  });

  test('a caller without admin-system is refused', async () => {
    const am = await makeGatedManager({ root: true });
    await expect(am.searchAuditLogs({}, {}, { username: 'mallory' })).rejects.toThrow(/admin-system/);
    await expect(am.getAuditStats({}, { username: 'mallory' })).rejects.toThrow(/admin-system/);
    await expect(am.exportAuditLogs({}, 'json', { username: 'mallory' })).rejects.toThrow(/admin-system/);
  });

  test('a missing or anonymous caller is refused — absence is not authority', async () => {
    const am = await makeGatedManager({ root: true });
    await expect(am.searchAuditLogs({}, {}, {})).rejects.toThrow(/admin-system/);
    await expect(am.searchAuditLogs({}, {}, { username: null })).rejects.toThrow(/admin-system/);
  });

  test('no UserManager to verify against: fail closed', async () => {
    const bareEngine = {
      getManager: vi.fn((name: string) =>
        name === 'ConfigurationManager' ? makeConfigManager() : null)
    } as unknown as WikiEngine;
    const am = new AuditManager(bareEngine);
    (am as unknown as { provider: unknown }).provider = {
      searchAuditLogs: vi.fn().mockResolvedValue({ results: [] })
    };
    await expect(am.searchAuditLogs({}, {}, { username: 'root' })).rejects.toThrow(/admin-system/);
  });
});

describe('#1156 the posture is recorded at boot and compared with the previous boot', () => {
  /**
   * The pure diff is covered in postureRecord.test.ts. THIS covers the part
   * that was untested: that AuditManager actually emits it. Deleting the
   * recordPosture() call used to leave every test green, which is the repo's
   * standing bar failing — so each of these must go red if the call goes.
   */
  const POSTURE = {
    'ngdpbase.security.posture': {
      'ngdpbase.session.secure': { group: 'Session and cookie', restart: true },
      'ngdpbase.auth.throttle.max-attempts': { group: 'Login throttling', restart: false }
    },
    'ngdpbase.session.secure': false,
    'ngdpbase.auth.throttle.max-attempts': 10
  };

  /** Capture what the manager writes, with a controllable previous record. */
  function harness(config: Record<string, unknown>, previous: Record<string, unknown> | null) {
    const engine = makeEngine(config);
    const am = new AuditManager(engine);
    const written: Array<Record<string, unknown>> = [];
    (am as unknown as { provider: unknown }).provider = {
      initialize: vi.fn().mockResolvedValue(undefined),
      logAuditEvent: vi.fn((e: Record<string, unknown>) => { written.push(e); return Promise.resolve('id'); }),
      searchAuditLogs: vi.fn((filters: { eventType?: string }) => Promise.resolve({
        results: filters.eventType === 'posture-recorded' && previous ? [previous] : [],
        total: 0, limit: 1, offset: 0, hasMore: false
      })),
      flush: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      isHealthy: vi.fn().mockResolvedValue(true),
      getAuditStats: vi.fn(), exportAuditLogs: vi.fn(),
      getProviderInfo: vi.fn().mockReturnValue({ name: 'Mock', version: '1', description: '', features: [] })
    };
    return { am, written };
  }

  const record = (written: Array<Record<string, unknown>>) =>
    written.find((e) => e.eventType === 'posture-recorded');

  test('a boot emits the posture', async () => {
    const { am, written } = harness(POSTURE, null);
    await (am as unknown as { recordPosture: () => Promise<void> }).recordPosture();
    expect(record(written)).toBeDefined();
  });

  test('with no previous record it does not claim the posture is unchanged', async () => {
    const { am, written } = harness(POSTURE, null);
    await (am as unknown as { recordPosture: () => Promise<void> }).recordPosture();
    const meta = record(written)?.metadata as { comparedWithPrevious?: boolean };
    expect(meta.comparedWithPrevious).toBe(false);
  });

  test('an unchanged posture is low severity and reports no drift', async () => {
    const previous = { metadata: { posture: { 'ngdpbase.session.secure': false, 'ngdpbase.auth.throttle.max-attempts': 10 } } };
    const { am, written } = harness(POSTURE, previous);
    await (am as unknown as { recordPosture: () => Promise<void> }).recordPosture();
    const e = record(written);
    expect(e?.severity).toBe('low');
    expect(e?.metadata).not.toHaveProperty('changed');
  });

  test('a value changed while the instance was down is HIGH and names both values', async () => {
    // The case the whole decision exists for: nothing observed the edit.
    const previous = { metadata: { posture: { 'ngdpbase.session.secure': false, 'ngdpbase.auth.throttle.max-attempts': 10 } } };
    const { am, written } = harness(
      { ...POSTURE, 'ngdpbase.auth.throttle.max-attempts': 999 },
      previous
    );
    await (am as unknown as { recordPosture: () => Promise<void> }).recordPosture();
    const e = record(written);
    expect(e?.severity).toBe('high');
    expect(JSON.stringify(e?.metadata)).toContain('999');
  });

  test('a secret ingredient never reaches the emitted record', async () => {
    const { am, written } = harness({
      'ngdpbase.security.posture': { 'ngdpbase.session.secret': { group: 'Session and cookie' } },
      'ngdpbase.config.secret-keys': ['ngdpbase.session.secret'],
      'ngdpbase.session.secret': 'the-actual-secret-value'
    }, null);
    await (am as unknown as { recordPosture: () => Promise<void> }).recordPosture();
    expect(JSON.stringify(written)).not.toContain('the-actual-secret-value');
    expect(JSON.stringify(record(written)?.metadata)).toContain('[secret]');
  });

  test('initialize() emits it — not just the method in isolation', async () => {
    // Found by sabotage: removing `await this.recordPosture()` from the boot
    // path left every other test in this block green, because they invoke the
    // method directly. A record nothing calls is a record nobody gets.
    const engine = makeEngine({ ...POSTURE, 'ngdpbase.audit.provider': 'nullauditprovider' });
    const am = new AuditManager(engine);
    const written: Array<Record<string, unknown>> = [];
    await am.initialize();
    (am as unknown as { provider: unknown }).provider = {
      logAuditEvent: vi.fn((e: Record<string, unknown>) => { written.push(e); return Promise.resolve('id'); }),
      searchAuditLogs: vi.fn().mockResolvedValue({ results: [], total: 0, limit: 1, offset: 0, hasMore: false }),
      flush: vi.fn().mockResolvedValue(undefined),
      getProviderInfo: vi.fn().mockReturnValue({ name: 'Mock', version: '1', description: '', features: [] })
    };
    // Re-run the boot path with an observable provider in place.
    await (am as unknown as { recordStart: () => Promise<void> }).recordStart();
    expect(written.some((e) => e.eventType === 'posture-recorded')).toBe(true);
  });

  test('an instance with no posture configured emits nothing', async () => {
    // Emitting an empty record every boot would be noise that teaches a reader
    // to skip the event.
    const { am, written } = harness({}, null);
    await (am as unknown as { recordPosture: () => Promise<void> }).recordPosture();
    expect(record(written)).toBeUndefined();
  });
});
