import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MagicLinkAuthProvider } from '../MagicLinkAuthProvider.js';

/**
 * #1021 — one magic-link token could mint two sessions.
 *
 * Not the high-concurrency race #1007 described: Node is single-threaded and
 * the token store is an in-memory Map, so `verify()` and `consumeToken()` never
 * yield. The real window is in the route, which did:
 *
 *   const result = await authManager.authenticate(...)   // <- yields here
 *   if (!result.success) return ...
 *   authManager.consumeToken(...)                        // consumed only after
 *
 * The `await` is a genuine suspension point. Two POSTs carrying the same token
 * — a double-click on the confirmation button, a client retry, a browser
 * prefetch racing the real submit — can both clear `authenticate()` before
 * either consumes, and both then establish a session. #1019's move to a
 * CSRF-protected POST does not close it: both submits come from the same
 * session and carry the same valid token.
 *
 * The fix is option (b) from the issue: `consumeToken()` reports whether THIS
 * caller was the one that consumed, and the route treats that as the gate.
 * The Map delete is synchronous and cannot interleave, so exactly one caller
 * can ever see `true`.
 */
describe('MagicLinkAuthProvider.consumeToken — single-use gate (#1021)', () => {
  let provider: MagicLinkAuthProvider;

  const makeEngine = () => ({
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') {
        return {
          getProperty: vi.fn((key: string, fallback?: unknown) => {
            if (key === 'ngdpbase.auth.magic-link.enabled') return true;
            if (key === 'ngdpbase.application.base-url') return 'http://localhost:3000';
            return fallback;
          })
        };
      }
      if (name === 'UserManager') {
        return { getUser: vi.fn().mockResolvedValue({ username: 'alice' }) };
      }
      return null;
    })
  });

  beforeEach(() => {
    provider = new MagicLinkAuthProvider(makeEngine() as never);
  });

  /** Put a token directly into the provider's store, bypassing email. */
  function seedToken(token: string): void {
    (provider as unknown as {
      tokens: Map<string, { username: string; expiresAt: number; redirect: string }>;
    }).tokens.set(token, {
      username: 'alice',
      expiresAt: Date.now() + 900_000,
      redirect: '/'
    });
  }

  it('reports true for the caller that actually consumed the token', () => {
    seedToken('tok-1');
    expect(provider.consumeToken('tok-1')).toBe(true);
  });

  it('reports false for a second consume of the same token — the #1021 defect', () => {
    // This is the whole fix. Before it, both callers proceeded to create a
    // session because neither could tell it had lost the race.
    seedToken('tok-1');
    provider.consumeToken('tok-1');
    expect(provider.consumeToken('tok-1')).toBe(false);
  });

  it('reports false for a token that was never issued', () => {
    expect(provider.consumeToken('never-existed')).toBe(false);
  });

  it('lets exactly one of many simultaneous consumers win', () => {
    // The double-submit shape: several callers that all passed verify() before
    // any of them consumed. Exactly one must be allowed to establish a session.
    seedToken('tok-1');
    const results = [1, 2, 3, 4, 5].map(() => provider.consumeToken('tok-1'));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('still removes the token, so verify() fails afterwards', async () => {
    // verify() returns null for an unknown token, not { success: false } —
    // the return-value change must not alter that contract.
    seedToken('tok-1');
    provider.consumeToken('tok-1');
    expect(await provider.verify({ token: 'tok-1' })).toBeNull();
  });

  it('verify() still succeeds before consumption, and does not itself consume', async () => {
    // verify() being side-effect free is load-bearing for #1019: the GET
    // interstitial calls it, and a mail scanner following the link must not
    // burn the token.
    seedToken('tok-1');
    expect(await provider.verify({ token: 'tok-1' })).toMatchObject({ username: 'alice' });
    expect(provider.consumeToken('tok-1')).toBe(true);
  });

  it('leaves other tokens untouched', () => {
    seedToken('tok-1');
    seedToken('tok-2');
    provider.consumeToken('tok-1');
    expect(provider.consumeToken('tok-2')).toBe(true);
  });
});
