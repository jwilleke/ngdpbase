import { STARTUP_BYPASS_PATHS, gateDecision, describeBlocked } from '../startupState';

const READY = true;
const STARTING = false;
const BLOCKED = true;
const NOT_BLOCKED = false;

/**
 * #1152 — startup failures are gated into survivable and fatal.
 *
 * The test is not severity. A malformed deny rule is serious, and the instance
 * should stop serving because of it. The question is whether stopping the
 * PROCESS helps, and it only helps when the process cannot offer a way out.
 */
describe('#1152 — gateDecision', () => {
  test('a ready instance serves everything', () => {
    expect(gateDecision(READY, NOT_BLOCKED, '/view/Welcome')).toBe('serve');
    expect(gateDecision(READY, NOT_BLOCKED, '/admin')).toBe('serve');
  });

  test('while starting, everything but static assets waits', () => {
    // Correct today and unchanged: the managers behind /admin are not up yet,
    // so letting the request through would fail in a worse way than a 503.
    expect(gateDecision(STARTING, NOT_BLOCKED, '/view/Welcome')).toBe('block');
    expect(gateDecision(STARTING, NOT_BLOCKED, '/admin')).toBe('block');
    expect(gateDecision(STARTING, NOT_BLOCKED, '/login')).toBe('block');
  });

  test('static assets always pass, so the maintenance page can render itself', () => {
    for (const blocked of [NOT_BLOCKED, BLOCKED]) {
      for (const path of STARTUP_BYPASS_PATHS) {
        expect(gateDecision(STARTING, blocked, `${path}/x`)).toBe('serve');
      }
    }
  });

  test('when configuration-blocked, the repair path opens', () => {
    // The engine FINISHED; a configuration value is the problem. Those screens
    // work, and they are the only way to fix it without filesystem access.
    expect(gateDecision(STARTING, BLOCKED, '/admin')).toBe('serve');
    expect(gateDecision(STARTING, BLOCKED, '/admin/configuration')).toBe('serve');
    expect(gateDecision(STARTING, BLOCKED, '/login')).toBe('serve');
    expect(gateDecision(STARTING, BLOCKED, '/logout')).toBe('serve');
  });

  test('when configuration-blocked, ordinary content is still refused', () => {
    expect(gateDecision(STARTING, BLOCKED, '/view/Welcome')).toBe('block');
    expect(gateDecision(STARTING, BLOCKED, '/')).toBe('block');
    expect(gateDecision(STARTING, BLOCKED, '/search')).toBe('block');
  });

  test('a path merely beginning with an allowed word is not a bypass', () => {
    // '/adminish' and '/loginext' are ordinary pages. Prefix matching without
    // a boundary is how a gate springs a leak.
    expect(gateDecision(STARTING, BLOCKED, '/adminish')).toBe('block');
    expect(gateDecision(STARTING, BLOCKED, '/loginextra')).toBe('block');
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

  test('says UNKNOWN rather than nothing when no reason was recorded', () => {
    // Blocked with no reason is an internal inconsistency — nothing sets the
    // blocked state without recording why. The page must say so rather than
    // render blank.
    expect(describeBlocked([])).toMatch(/UNKNOWN/);
  });

  test('the repair path stays open even when the reason is unknown', () => {
    // The recoverable answer: an operator can still sign in and look. Blocking
    // everything because we cannot explain ourselves is the worst outcome.
    expect(gateDecision(STARTING, BLOCKED, '/login')).toBe('serve');
    expect(gateDecision(STARTING, BLOCKED, '/admin')).toBe('serve');
  });
});
