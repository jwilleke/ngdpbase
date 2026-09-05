import { buildConfigChangeAuditEvent, isSecretKey, describeConfigValue } from '../auditConfigChange';

/** #1179: the builder takes an attribution read from the caller's context, never a bare name. */
const JIM = { user: 'jim', ipAddress: '203.0.113.7', metadata: { origin: 'request' } };

/**
 * #1150 — no administrative configuration change was audited.
 *
 * An administrator could change any setting on the instance — whether HTML is
 * sanitised, the login throttle thresholds, the egress ranges, the session
 * cookie flags, whether auditing runs at all — and the log held no record,
 * while faithfully recording that somebody viewed a page.
 */
describe('#1150 — isSecretKey', () => {
  const secrets = ['ngdpbase.session.secret', 'ngdpbase.user.security.passwordsalt'];

  test('recognises a configured secret key', () => {
    expect(isSecretKey('ngdpbase.session.secret', secrets)).toBe(true);
  });

  test('an ordinary key is not secret', () => {
    expect(isSecretKey('ngdpbase.session.secure', secrets)).toBe(false);
  });

  test('an empty or absent list means nothing is treated as secret', () => {
    expect(isSecretKey('ngdpbase.session.secret', [])).toBe(false);
    expect(isSecretKey('ngdpbase.session.secret', undefined)).toBe(false);
  });

  test('a non-string entry in the list is ignored rather than throwing', () => {
    // The list is operator-editable configuration, so it can contain anything.
    expect(isSecretKey('ngdpbase.session.secret', [null, 42, 'ngdpbase.session.secret'] as never)).toBe(true);
  });
});

describe('#1150 — describeConfigValue', () => {
  test('primitives are recorded as they are', () => {
    expect(describeConfigValue(true)).toBe(true);
    expect(describeConfigValue(30000)).toBe(30000);
    expect(describeConfigValue('refuse-boot')).toBe('refuse-boot');
    expect(describeConfigValue(null)).toBeNull();
  });

  test('an object is recorded as JSON so the change is readable', () => {
    expect(describeConfigValue({ a: 1 })).toBe('{"a":1}');
  });

  test('a very large value is truncated and says so', () => {
    const big = 'x'.repeat(2000);
    const out = describeConfigValue(big) as string;
    expect(out.length).toBeLessThan(700);
    expect(out).toContain('truncated');
  });

  test('a value that cannot be serialised does not throw', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => describeConfigValue(circular)).not.toThrow();
  });
});

describe('#1150 — buildConfigChangeAuditEvent', () => {
  test('records the key, both values and who changed it', () => {
    const event = buildConfigChangeAuditEvent({
      key: 'ngdpbase.session.secure', before: false, after: true, actor: JIM, secret: false
    });
    expect(event.eventType).toBe('config-change');
    expect(event.user).toBe('jim');
    expect(event.ipAddress).toBe('203.0.113.7');
    expect(event.metadata.origin).toBe('request');
    expect(event.metadata.key).toBe('ngdpbase.session.secure');
    expect(event.metadata.before).toBe(false);
    expect(event.metadata.after).toBe(true);
  });

  test('a secret key records that it changed and NEITHER value', () => {
    // An entry naming a key and its before and after values would reintroduce
    // the disclosure ngdpbase.config.secret-keys exists to prevent — by a
    // different route, into a file with a longer retention.
    const event = buildConfigChangeAuditEvent({
      key: 'ngdpbase.session.secret', before: 'old-secret-value', after: 'new-secret-value',
      actor: JIM, secret: true
    });
    expect(event.metadata.key).toBe('ngdpbase.session.secret');
    expect(event.metadata).not.toHaveProperty('before');
    expect(event.metadata).not.toHaveProperty('after');
    expect(event.metadata.secret).toBe(true);
    expect(JSON.stringify(event)).not.toContain('old-secret-value');
    expect(JSON.stringify(event)).not.toContain('new-secret-value');
  });

  test('#1179 a change no request drove names the system principal and its reason, from a JobContext', () => {
    // The old shape recorded `system` when the actor was omitted — a guess.
    // Now the attribution is mandatory and comes from the context the write
    // was handed; a boot-time change arrives with a JobContext that says why.
    const event = buildConfigChangeAuditEvent({
      key: 'k', before: 1, after: 2, secret: false,
      actor: { user: 'System', metadata: { origin: 'boot', reason: 'seed at boot' } }
    });
    expect(event.user).toBe('System');
    expect(event.ipAddress).toBeUndefined();
    expect(event.metadata).toMatchObject({ origin: 'boot', reason: 'seed at boot', key: 'k' });
  });

  test('a change that sets a key for the first time says the previous value was unset', () => {
    const event = buildConfigChangeAuditEvent({
      key: 'k', before: undefined, after: 'x', actor: JIM, secret: false
    });
    expect(event.metadata.before).toBeNull();
    expect(event.metadata.wasUnset).toBe(true);
  });
});
