/**
 * #1046 — login was dead on every HTTPS deployment behind terminated TLS.
 *
 * `secure` cookie on + `trust proxy` off means express-session never emits
 * Set-Cookie, so the next request has no session, so the CSRF token it was
 * checked against does not exist, so `POST /login` answers 403. The pair has
 * to be resolved together, and these cases pin that.
 */
import { describe, test, expect } from 'vitest';
import { resolveSessionSecurity } from '../sessionSecurity.js';

const SECURE = 'ngdpbase.session.secure';
const TRUST = 'ngdpbase.server.trust-proxy';

describe('resolveSessionSecurity', () => {
  describe('secure flag', () => {
    test('defaults on in production when the operator has said nothing', () => {
      expect(resolveSessionSecurity({}, 'production').secure).toBe(true);
    });

    test('defaults off outside production so http://localhost still works', () => {
      expect(resolveSessionSecurity({}, 'development').secure).toBe(false);
      expect(resolveSessionSecurity({}, undefined).secure).toBe(false);
    });

    test('an explicit operator boolean wins over the NODE_ENV default', () => {
      expect(resolveSessionSecurity({ [SECURE]: false }, 'production').secure).toBe(false);
      expect(resolveSessionSecurity({ [SECURE]: true }, 'development').secure).toBe(true);
    });

    test('a non-boolean override is ignored rather than coerced', () => {
      // The merged config ships a real boolean; a string here means someone
      // hand-edited the custom file. "false" would be truthy if coerced.
      expect(resolveSessionSecurity({ [SECURE]: 'false' }, 'production').secure).toBe(true);
    });
  });

  describe('trust proxy derivation — the #1046 fix', () => {
    test('turns on whenever secure resolves on', () => {
      const resolved = resolveSessionSecurity({}, 'production');
      expect(resolved.secure).toBe(true);
      expect(resolved.trustProxy).toBe(true);
      expect(resolved.trustProxyDerived).toBe(true);
    });

    test('derives from an explicit secure:true even outside production', () => {
      const resolved = resolveSessionSecurity({ [SECURE]: true }, 'development');
      expect(resolved.trustProxy).toBe(true);
      expect(resolved.trustProxyDerived).toBe(true);
    });

    test('stays off when secure is off — a direct http instance must not trust XFF', () => {
      const resolved = resolveSessionSecurity({}, 'development');
      expect(resolved.trustProxy).toBe(false);
      expect(resolved.trustProxyDerived).toBe(false);
    });

    test('an explicit secure:false in production keeps trust proxy off', () => {
      const resolved = resolveSessionSecurity({ [SECURE]: false }, 'production');
      expect(resolved.secure).toBe(false);
      expect(resolved.trustProxy).toBe(false);
      expect(resolved.trustProxyDerived).toBe(false);
    });
  });

  describe('operator overrides of trust proxy', () => {
    test('a hop count is passed through untouched', () => {
      const resolved = resolveSessionSecurity({ [SECURE]: true, [TRUST]: 2 }, 'production');
      expect(resolved.trustProxy).toBe(2);
      expect(resolved.trustProxyDerived).toBe(false);
      expect(resolved.misconfigured).toBe(false);
    });

    test('a subnet list is passed through untouched', () => {
      const resolved = resolveSessionSecurity({ [TRUST]: 'loopback, 10.0.0.0/8' }, 'production');
      expect(resolved.trustProxy).toBe('loopback, 10.0.0.0/8');
      expect(resolved.trustProxyDerived).toBe(false);
    });

    test('trust proxy can be enabled with secure off (the #861 tunnel case)', () => {
      const resolved = resolveSessionSecurity({ [SECURE]: false, [TRUST]: true }, 'production');
      expect(resolved.secure).toBe(false);
      expect(resolved.trustProxy).toBe(true);
      expect(resolved.misconfigured).toBe(false);
    });
  });

  describe('misconfiguration flag', () => {
    test('flags the unshippable pair: secure on, trust proxy explicitly off', () => {
      const resolved = resolveSessionSecurity({ [TRUST]: false }, 'production');
      expect(resolved.secure).toBe(true);
      expect(resolved.trustProxy).toBe(false);
      expect(resolved.misconfigured).toBe(true);
    });

    test('honours the stated choice rather than overriding it', () => {
      // An operator who wrote trust-proxy:false gets what they asked for; the
      // caller logs a warning. Silently flipping a stated value is worse.
      expect(resolveSessionSecurity({ [TRUST]: false }, 'production').trustProxy).toBe(false);
    });

    test('does not flag trust proxy off when secure is also off', () => {
      expect(resolveSessionSecurity({ [TRUST]: false }, 'development').misconfigured).toBe(false);
    });
  });

  test('tolerates a missing custom-properties object', () => {
    expect(resolveSessionSecurity(null, 'production').secure).toBe(true);
    expect(resolveSessionSecurity(undefined, 'production').trustProxy).toBe(true);
  });
});

describe('#1160 native TLS removes the reason to derive trust proxy', () => {
  /**
   * The derivation exists because `secure: true` implied TLS terminated
   * UPSTREAM — a proxy whose X-Forwarded-Proto Express must be told to read.
   * #1153 made the server able to terminate TLS itself, and then there is no
   * proxy, and trusting a forwarded header that nothing sets is worse than not
   * trusting it: a caller can assert their own address and scheme, which the
   * login throttle counts by and the audit log records.
   */
  test('with native TLS, secure does NOT derive trust proxy', () => {
    const r = resolveSessionSecurity({ 'ngdpbase.session.secure': true }, 'production', { nativeTls: true });
    expect(r.secure).toBe(true);
    expect(r.trustProxy).toBe(false);
    expect(r.trustProxyDerived).toBe(false);
  });

  test('without native TLS the derivation is unchanged', () => {
    // The #1046 case, which must keep working: behind terminated TLS, secure
    // without trust proxy means no session cookie reaches the browser and
    // nobody can sign in.
    const r = resolveSessionSecurity({ 'ngdpbase.session.secure': true }, 'production', { nativeTls: false });
    expect(r.trustProxy).toBe(true);
    expect(r.trustProxyDerived).toBe(true);
  });

  test('an explicit trust proxy still wins, native TLS or not', () => {
    for (const nativeTls of [true, false]) {
      const r = resolveSessionSecurity(
        { 'ngdpbase.session.secure': true, 'ngdpbase.server.trust-proxy': 2 },
        'production',
        { nativeTls }
      );
      expect(r.trustProxy).toBe(2);
      expect(r.trustProxyDerived).toBe(false);
    }
  });

  test('secure with trust-proxy explicitly false is NOT misconfigured under native TLS', () => {
    // It is the correct configuration: the server is the TLS endpoint. Warning
    // about it would train an operator to ignore the warning, and the warning
    // is load-bearing in the upstream-TLS case.
    const r = resolveSessionSecurity(
      { 'ngdpbase.session.secure': true, 'ngdpbase.server.trust-proxy': false },
      'production',
      { nativeTls: true }
    );
    expect(r.misconfigured).toBe(false);
  });

  test('secure with trust-proxy explicitly false IS misconfigured without native TLS', () => {
    const r = resolveSessionSecurity(
      { 'ngdpbase.session.secure': true, 'ngdpbase.server.trust-proxy': false },
      'production',
      { nativeTls: false }
    );
    expect(r.misconfigured).toBe(true);
  });

  test('omitting the option keeps the pre-#1160 behaviour', () => {
    // Every existing caller and test passes two arguments. Defaulting to "no
    // native TLS" keeps them correct rather than silently changing what they
    // assert.
    const r = resolveSessionSecurity({ 'ngdpbase.session.secure': true }, 'production');
    expect(r.trustProxy).toBe(true);
  });
});
