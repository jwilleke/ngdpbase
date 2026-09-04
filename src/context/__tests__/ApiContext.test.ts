'use strict';

import { ApiContext, ApiError } from '../ApiContext';
import type { Request } from 'express';

// ── helpers ──────────────────────────────────────────────────────────────────

const mockEngine = { getManager: vi.fn() };

function makeReq({ userContext = {}, session = {} } = {}) {
  return { userContext, session } as unknown as Request;
}

// ── ApiError ─────────────────────────────────────────────────────────────────

describe('ApiError', () => {
  test('carries status and message', () => {
    const err = new ApiError(403, 'Forbidden');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });

  test('is distinguishable from generic Error', () => {
    expect(new ApiError(401, 'x')).toBeInstanceOf(ApiError);
    expect(new Error('x')).not.toBeInstanceOf(ApiError);
  });
});

// ── ApiContext.from() ─────────────────────────────────────────────────────────

describe('ApiContext.from()', () => {
  describe('authenticated user', () => {
    let ctx;
    beforeEach(() => {
      ctx = ApiContext.from(
        makeReq({
          userContext: {
            username: 'jane',
            displayName: 'Jane Smith',
            email: 'jane@example.com',
            roles: ['reader', 'clubhouse-manager', 'Authenticated', 'All'],
            isAuthenticated: true
          },
          session: { isAuthenticated: true }
        }),
        mockEngine
      );
    });

    test('isAuthenticated is true', () => expect(ctx.isAuthenticated).toBe(true));
    test('username populated', () => expect(ctx.username).toBe('jane'));
    test('displayName populated', () => expect(ctx.displayName).toBe('Jane Smith'));
    test('email populated', () => expect(ctx.email).toBe('jane@example.com'));
    test('roles populated', () => expect(ctx.roles).toEqual(['reader', 'clubhouse-manager', 'Authenticated', 'All']));
    test('engine reference passed through', () => expect(ctx.engine).toBe(mockEngine));
  });

  describe('anonymous / unauthenticated user', () => {
    let ctx;
    beforeEach(() => {
      ctx = ApiContext.from(
        makeReq({
          userContext: {
            username: 'Anonymous',
            roles: ['Anonymous', 'All'],
            isAuthenticated: false
          },
          session: { isAuthenticated: false }
        }),
        mockEngine
      );
    });

    test('isAuthenticated is false', () => expect(ctx.isAuthenticated).toBe(false));
    test('username is Anonymous', () => expect(ctx.username).toBe('Anonymous'));
    test('roles contain Anonymous and All', () => {
      expect(ctx.roles).toContain('Anonymous');
      expect(ctx.roles).toContain('All');
    });
  });

  describe('missing / empty userContext', () => {
    test('handles undefined userContext gracefully', () => {
      const ctx = ApiContext.from(makeReq({ userContext: undefined }), mockEngine);
      expect(ctx.isAuthenticated).toBe(false);
      expect(ctx.username).toBeNull();
      expect(ctx.roles).toEqual([]);
    });

    test('handles empty userContext gracefully', () => {
      const ctx = ApiContext.from(makeReq({ userContext: {} }), mockEngine);
      expect(ctx.isAuthenticated).toBe(false);
      expect(ctx.username).toBeNull();
      expect(ctx.email).toBeNull();
      expect(ctx.displayName).toBeNull();
      expect(ctx.roles).toEqual([]);
    });

    test('falls back to session.isAuthenticated when userContext lacks it', () => {
      const ctx = ApiContext.from(
        makeReq({
          userContext: { username: 'bob', roles: ['reader'] },
          session: { isAuthenticated: true }
        }),
        mockEngine
      );
      expect(ctx.isAuthenticated).toBe(true);
    });
  });
});

// ── hasRole() ─────────────────────────────────────────────────────────────────

// #1198: hasRole / requireRole are gone from ApiContext — a role name is not authority (security-posture.md P2).

// ── requireAuthenticated() ────────────────────────────────────────────────────

describe('ApiContext#requireAuthenticated()', () => {
  test('does not throw when authenticated', () => {
    const ctx = ApiContext.from(
      makeReq({ userContext: { isAuthenticated: true, roles: [] } }),
      mockEngine
    );
    expect(() => ctx.requireAuthenticated()).not.toThrow();
  });

  test('throws ApiError(401) when not authenticated', () => {
    const ctx = ApiContext.from(
      makeReq({ userContext: { isAuthenticated: false, roles: [] } }),
      mockEngine
    );
    expect(() => ctx.requireAuthenticated()).toThrow(ApiError);
    try {
      ctx.requireAuthenticated();
    } catch (err) {
      expect(err.status).toBe(401);
    }
  });
});

// ── hasPermission() ───────────────────────────────────────────────────────────

describe('ApiContext#hasPermission()', () => {
  // #630: hasPermission now delegates to UserManager.hasPermission (canonical
  // PolicyEvaluator-backed path) rather than reading roles.definitions directly
  // from ConfigurationManager. Tests mock UserManager.hasPermission accordingly.

  function makeEngineWithUserManager(allowed: boolean | ((user: string, action: string) => boolean)) {
    const hasPermission = typeof allowed === 'function'
      ? vi.fn(async (u: string, a: string) => allowed(u, a))
      : vi.fn().mockResolvedValue(allowed);
    return {
      getManager: vi.fn((name: string) => name === 'UserManager' ? { hasPermission } : null),
      _hasPermission: hasPermission
    };
  }

  test('delegates to UserManager.hasPermission passing the resolved userContext (#637 fast path)', async () => {
    const engine = makeEngineWithUserManager(true);
    const ctx = ApiContext.from(
      makeReq({ userContext: { username: 'jane', roles: ['editor'], isAuthenticated: true } }),
      engine
    );
    const result = await ctx.hasPermission('page-edit');
    // #637: caller passes a structured userContext object instead of just the
    // username so UserManager can skip provider.getUser + resolveUserRoles.
    expect(engine._hasPermission).toHaveBeenCalledWith(
      { username: 'jane', roles: ['editor'], isAuthenticated: true },
      'page-edit'
    );
    expect(result).toBe(true);
  });

  test('passes a named anonymous subject, not an empty string (#1173)', async () => {
    // The empty string was the username-form of the call, and that form is
    // gone: it could not carry an agent token, so the scope ceiling had
    // nothing to read. One code path in, always a subject.
    const engine = makeEngineWithUserManager(false);
    const ctx = ApiContext.from(makeReq({ userContext: undefined }), engine);
    const result = await ctx.hasPermission('admin-system');
    expect(engine._hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'Anonymous', isAuthenticated: false }),
      'admin-system'
    );
    expect(result).toBe(false);
  });

  test('returns whatever UserManager.hasPermission returns (true)', async () => {
    const engine = makeEngineWithUserManager(true);
    const ctx = ApiContext.from(
      makeReq({ userContext: { username: 'alice', roles: ['admin'], isAuthenticated: true } }),
      engine
    );
    expect(await ctx.hasPermission('admin-system')).toBe(true);
  });

  test('returns whatever UserManager.hasPermission returns (false)', async () => {
    const engine = makeEngineWithUserManager(false);
    const ctx = ApiContext.from(
      makeReq({ userContext: { username: 'bob', roles: ['reader'], isAuthenticated: true } }),
      engine
    );
    expect(await ctx.hasPermission('admin-system')).toBe(false);
  });

  test('returns false when UserManager is unavailable', async () => {
    const engine = { getManager: vi.fn().mockReturnValue(null) };
    const ctx = ApiContext.from(
      makeReq({ userContext: { username: 'alice', roles: ['admin'], isAuthenticated: true } }),
      engine
    );
    expect(await ctx.hasPermission('admin-system')).toBe(false);
  });
});

// ── requirePermission() ───────────────────────────────────────────────────────

describe('ApiContext#requirePermission()', () => {
  function makeEngineWithUserManager(allowed: boolean) {
    return {
      getManager: vi.fn((name: string) => name === 'UserManager' ? {
        hasPermission: vi.fn().mockResolvedValue(allowed)
      } : null)
    };
  }

  test('does not throw when caller has the permission', async () => {
    const engine = makeEngineWithUserManager(true);
    const ctx = ApiContext.from(
      makeReq({ userContext: { username: 'alice', roles: ['admin'], isAuthenticated: true } }),
      engine
    );
    await expect(ctx.requirePermission('search-user')).resolves.not.toThrow();
  });

  test('throws ApiError(403) when caller lacks the permission', async () => {
    const engine = makeEngineWithUserManager(false);
    const ctx = ApiContext.from(
      makeReq({ userContext: { username: 'bob', roles: ['reader'], isAuthenticated: true } }),
      engine
    );
    await expect(ctx.requirePermission('search-user')).rejects.toThrow(ApiError);
    try { await ctx.requirePermission('search-user'); } catch (err) {
      expect(err.status).toBe(403);
    }
  });
});

// ── requireRole() ─────────────────────────────────────────────────────────────

// #1198: hasRole / requireRole are gone from ApiContext — a role name is not authority (security-posture.md P2).
