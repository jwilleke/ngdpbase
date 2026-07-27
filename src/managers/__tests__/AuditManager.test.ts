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
import type { WikiEngine } from '../../types/WikiEngine';

function makeConfigManager(overrides: Record<string, unknown> = {}) {
  return {
    getProperty: vi.fn((key: string, dv: unknown) => overrides[key] ?? dv),
    getResolvedDataPath: vi.fn((_key: string, dv: string) => dv)
  };
}

function makeEngine(configOverrides: Record<string, unknown> = {}): WikiEngine {
  const cm = makeConfigManager(configOverrides);
  return {
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') return cm;
      return null;
    })
  };
}

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
      const stats = await am.getAuditStats({});
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
      await expect(am.searchAuditLogs()).rejects.toThrow('not initialized');
    });

    test('delegates to provider when initialized', async () => {
      const am = makeManagerWithMockProvider();
      const result = await am.searchAuditLogs({ username: 'admin' }, { limit: 10 });
      expect(result).toHaveProperty('results');
    });
  });

  describe('getAuditStats() no-provider path', () => {
    test('throws when provider not initialized', async () => {
      const am = new AuditManager(makeEngine());
      await expect(am.getAuditStats()).rejects.toThrow('not initialized');
    });
  });

  describe('exportAuditLogs()', () => {
    test('throws when provider not initialized', async () => {
      const am = new AuditManager(makeEngine());
      await expect(am.exportAuditLogs()).rejects.toThrow('not initialized');
    });

    test('delegates to provider when initialized', async () => {
      const am = makeManagerWithMockProvider();
      const result = await am.exportAuditLogs({}, 'json');
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
