import { describe, it, expect } from 'vitest';
import {
  newDeviceState,
  evaluateDeviceBinding,
  DEVICE_STATE_COOKIE,
  deviceStateCookieOptions
} from '../magicLinkDeviceState.js';

/**
 * #1022 — a magic link is bearer-only: anyone holding the URL can sign in. A
 * forwarded email, a link pasted into chat, or a mailbox someone else can read
 * is a complete account takeover, with no second factor and nothing in the log
 * saying where the login came from.
 *
 * The issue is explicit that strict binding must NOT be the default, because
 * "request on a laptop, open the mail on a phone" is the common real flow, and
 * silently breaking it would be worse than the risk being mitigated. So this
 * splits in two:
 *
 *   - observability (always on): record whether the redeeming browser is the
 *     one that asked, plus IP and User-Agent, so a suspicious redemption is
 *     visible after the fact.
 *   - enforcement (opt-in): refuse a mismatch.
 *
 * These pin the decision table. The dangerous direction throughout is
 * answering "match" when we cannot actually prove one — an absent cookie must
 * never read as a pass.
 */
describe('newDeviceState', () => {
  it('produces a long, random-looking value', () => {
    const state = newDeviceState();
    expect(state).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 50 }, () => newDeviceState()));
    expect(seen.size).toBe(50);
  });
});

describe('deviceStateCookieOptions', () => {
  it('is httpOnly so page scripts cannot read or forge it', () => {
    expect(deviceStateCookieOptions(900_000).httpOnly).toBe(true);
  });

  it('uses SameSite=Lax so it survives the click from an email client', () => {
    // Strict would drop the cookie on the cross-site navigation from a webmail
    // tab, which would make every redemption look like a mismatch.
    expect(deviceStateCookieOptions(900_000).sameSite).toBe('lax');
  });

  it('expires with the token rather than lingering', () => {
    expect(deviceStateCookieOptions(900_000).maxAge).toBe(900_000);
  });

  it('is scoped to the whole site so the request and redeem paths share it', () => {
    expect(deviceStateCookieOptions(900_000).path).toBe('/');
  });

  it('marks the cookie secure when asked', () => {
    expect(deviceStateCookieOptions(900_000, true).secure).toBe(true);
    expect(deviceStateCookieOptions(900_000, false).secure).toBe(false);
  });
});

describe('evaluateDeviceBinding', () => {
  const STATE = 'a'.repeat(64);
  const OTHER = 'b'.repeat(64);

  describe('when the token carries no state (issued before this feature)', () => {
    it('reports unknown and allows — an old token must not be locked out', () => {
      // Tokens live in memory for ~15 minutes. On the deploy that ships this,
      // tokens issued minutes earlier have no stored state, and refusing them
      // would sign out people mid-flow for no security gain.
      const r = evaluateDeviceBinding({ stored: null, presented: STATE, enforce: true });
      expect(r.outcome).toBe('unknown');
      expect(r.allowed).toBe(true);
    });
  });

  describe('matching', () => {
    it('reports match when the cookie equals the stored state', () => {
      const r = evaluateDeviceBinding({ stored: STATE, presented: STATE, enforce: false });
      expect(r.outcome).toBe('match');
      expect(r.allowed).toBe(true);
    });

    it('allows a match under enforcement too', () => {
      const r = evaluateDeviceBinding({ stored: STATE, presented: STATE, enforce: true });
      expect(r.allowed).toBe(true);
    });
  });

  describe('mismatch — a different browser presented a different cookie', () => {
    it('reports mismatch but allows when enforcement is off (the default)', () => {
      // This is the whole point of shipping observability first: the event is
      // recorded, the user is not blocked.
      const r = evaluateDeviceBinding({ stored: STATE, presented: OTHER, enforce: false });
      expect(r.outcome).toBe('mismatch');
      expect(r.allowed).toBe(true);
    });

    it('refuses when enforcement is on', () => {
      const r = evaluateDeviceBinding({ stored: STATE, presented: OTHER, enforce: true });
      expect(r.outcome).toBe('mismatch');
      expect(r.allowed).toBe(false);
    });
  });

  describe('absent cookie — the cross-device flow', () => {
    it('reports absent, not match, when no cookie was presented', () => {
      // The dangerous direction. Treating "no cookie" as a pass would make the
      // enforcement setting do nothing at all against the exact attacker it
      // targets, since a forwarded link arrives with no cookie either.
      const r = evaluateDeviceBinding({ stored: STATE, presented: null, enforce: false });
      expect(r.outcome).toBe('absent');
      expect(r.allowed).toBe(true);
    });

    it('refuses an absent cookie under enforcement', () => {
      const r = evaluateDeviceBinding({ stored: STATE, presented: null, enforce: true });
      expect(r.outcome).toBe('absent');
      expect(r.allowed).toBe(false);
    });

    it('treats an empty-string cookie as absent rather than as a value', () => {
      const r = evaluateDeviceBinding({ stored: STATE, presented: '', enforce: true });
      expect(r.outcome).toBe('absent');
      expect(r.allowed).toBe(false);
    });
  });

  describe('comparison safety', () => {
    it('does not match on a prefix', () => {
      const r = evaluateDeviceBinding({ stored: STATE, presented: STATE.slice(0, 32), enforce: false });
      expect(r.outcome).toBe('mismatch');
    });

    it('is case-sensitive', () => {
      const r = evaluateDeviceBinding({ stored: STATE, presented: STATE.toUpperCase(), enforce: false });
      expect(r.outcome).toBe('mismatch');
    });

    it('compares equal-length values in constant time without throwing', () => {
      expect(() => evaluateDeviceBinding({
        stored: STATE, presented: OTHER, enforce: false
      })).not.toThrow();
    });
  });

  it('exposes a stable cookie name', () => {
    expect(DEVICE_STATE_COOKIE).toBe('ngdp_ml_state');
  });
});
