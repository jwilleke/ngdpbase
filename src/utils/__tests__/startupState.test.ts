import { STARTUP_BYPASS_PATHS, gateDecision, describeBlocked } from '../startupState';

/**
 * #1152 — startup failures are gated into survivable and fatal.
 *
 * The test is not severity. A malformed deny rule is serious, and the instance
 * should stop serving because of it. The question is whether stopping the
 * PROCESS helps, and it only helps when the process cannot offer a way out.
 */
describe('#1152 — gateDecision', () => {
  test('a ready instance serves everything', () => {
    expect(gateDecision('ready', '/view/Welcome')).toBe('serve');
    expect(gateDecision('ready', '/admin')).toBe('serve');
  });

  test('while starting, everything but static assets waits', () => {
    // Correct today and unchanged: the managers behind /admin are not up yet,
    // so letting the request through would fail in a worse way than a 503.
    expect(gateDecision('starting', '/view/Welcome')).toBe('block');
    expect(gateDecision('starting', '/admin')).toBe('block');
    expect(gateDecision('starting', '/login')).toBe('block');
  });

  test('static assets always pass, so the maintenance page can render itself', () => {
    for (const state of ['starting', 'configuration-blocked'] as const) {
      for (const path of STARTUP_BYPASS_PATHS) {
        expect(gateDecision(state, `${path}/x`)).toBe('serve');
      }
    }
  });

  test('when configuration-blocked, the repair path opens', () => {
    // The engine FINISHED; a configuration value is the problem. Those screens
    // work, and they are the only way to fix it without filesystem access.
    expect(gateDecision('configuration-blocked', '/admin')).toBe('serve');
    expect(gateDecision('configuration-blocked', '/admin/configuration')).toBe('serve');
    expect(gateDecision('configuration-blocked', '/login')).toBe('serve');
    expect(gateDecision('configuration-blocked', '/logout')).toBe('serve');
  });

  test('when configuration-blocked, ordinary content is still refused', () => {
    expect(gateDecision('configuration-blocked', '/view/Welcome')).toBe('block');
    expect(gateDecision('configuration-blocked', '/')).toBe('block');
    expect(gateDecision('configuration-blocked', '/search')).toBe('block');
  });

  test('a path merely beginning with an allowed word is not a bypass', () => {
    // '/adminish' and '/loginext' are ordinary pages. Prefix matching without
    // a boundary is how a gate springs a leak.
    expect(gateDecision('configuration-blocked', '/adminish')).toBe('block');
    expect(gateDecision('configuration-blocked', '/loginextra')).toBe('block');
  });
});

describe('#1152 — describeBlocked', () => {
  test('names every reason so the operator sees all of them at once', () => {
    const text = describeBlocked([
      "ngdpbase.security.egress.denied-ranges: '10.0.0.0./8' is not a valid CIDR range",
      'audit provider DatabaseAuditProvider could not be used'
    ]);
    expect(text).toContain('10.0.0.0./8');
    expect(text).toContain('DatabaseAuditProvider');
  });

  test('is never empty, even given nothing', () => {
    // A maintenance page that says the configuration is broken and cannot say
    // what is worse than no page at all.
    expect(describeBlocked([]).length).toBeGreaterThan(0);
  });
});
