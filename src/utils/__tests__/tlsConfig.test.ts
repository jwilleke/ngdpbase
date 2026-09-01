import { resolveTlsConfig, TLS_CERT_KEY, TLS_KEY_KEY } from '../tlsConfig';

/**
 * #1153 — serve HTTPS when a cert and key are configured.
 *
 * A BROKEN TLS configuration must not silently become HTTP. That is a
 * transport downgrade: the operator configured TLS, believes traffic is
 * encrypted, and it is in the clear. It takes #1152's survivable-failure path
 * instead — maintenance mode, naming the bad file, with /admin reachable.
 */
describe('#1153 — resolveTlsConfig', () => {
  const read = (values: Record<string, unknown>) =>
    (key: string, fallback?: unknown) => (key in values ? values[key] : fallback);

  const deps = (over: Partial<Parameters<typeof resolveTlsConfig>[1]> = {}) => ({
    readFile: (p: string) => Buffer.from(`contents-of-${p}`),
    createSecureContext: () => undefined,
    now: () => new Date('2026-09-01T00:00:00Z'),
    certExpiry: () => '2026-10-24T06:05:35Z',
    ...over
  });

  test('neither configured is plain HTTP, and not an error', () => {
    // The ordinary case. Most instances have no certificate and must not be
    // told they have a problem.
    const r = resolveTlsConfig(read({}), deps());
    expect(r.mode).toBe('http');
  });

  test('both configured and usable serves HTTPS', () => {
    const r = resolveTlsConfig(read({ [TLS_CERT_KEY]: '/c.crt', [TLS_KEY_KEY]: '/c.key' }), deps());
    expect(r.mode).toBe('https');
  });

  test('only the cert configured is BLOCKED, not silently HTTP', () => {
    // An operator halfway through configuring TLS. Serving HTTP here would be
    // the silent downgrade this design exists to prevent.
    const r = resolveTlsConfig(read({ [TLS_CERT_KEY]: '/c.crt' }), deps());
    expect(r.mode).toBe('blocked');
    expect(r.reasons.join(' ')).toMatch(new RegExp(TLS_KEY_KEY.replace(/\./g, '\\.')));
  });

  test('only the key configured is BLOCKED', () => {
    const r = resolveTlsConfig(read({ [TLS_KEY_KEY]: '/c.key' }), deps());
    expect(r.mode).toBe('blocked');
    expect(r.reasons.join(' ')).toMatch(new RegExp(TLS_CERT_KEY.replace(/\./g, '\\.')));
  });

  test('an unreadable file is BLOCKED and names the path', () => {
    const r = resolveTlsConfig(
      read({ [TLS_CERT_KEY]: '/missing.crt', [TLS_KEY_KEY]: '/c.key' }),
      deps({ readFile: (p: string) => { if (p === '/missing.crt') throw new Error('ENOENT'); return Buffer.from('x'); } })
    );
    expect(r.mode).toBe('blocked');
    expect(r.reasons.join(' ')).toContain('/missing.crt');
  });

  test('malformed PEM is BLOCKED — createSecureContext throws synchronously', () => {
    // Verified against Node 24: ERR_OSSL_PEM_NO_START_LINE, thrown rather than
    // emitted, which is what makes it catchable at startup at all.
    const r = resolveTlsConfig(
      read({ [TLS_CERT_KEY]: '/c.crt', [TLS_KEY_KEY]: '/c.key' }),
      deps({ createSecureContext: () => { throw new Error('error:0909006C:PEM routines:get_name:no start line'); } })
    );
    expect(r.mode).toBe('blocked');
    expect(r.reasons.join(' ')).toMatch(/PEM|no start line/i);
  });

  test('an EXPIRED certificate still serves HTTPS, and says so', () => {
    // The deliberate exception. Falling back would downgrade the transport
    // over a certificate that is merely stale, and blocking would take down an
    // instance whose operator may be mid-renewal. A stale certificate is
    // already loudly visible to every client; a silent downgrade is not.
    const r = resolveTlsConfig(
      read({ [TLS_CERT_KEY]: '/c.crt', [TLS_KEY_KEY]: '/c.key' }),
      deps({ certExpiry: () => '2026-08-01T00:00:00Z' })
    );
    expect(r.mode).toBe('https');
    if (r.mode === 'https') expect(r.expired).toBe(true);
  });

  test('a certificate whose expiry cannot be read still serves, unflagged', () => {
    // Node itself does not validate notAfter, so an unreadable expiry is no
    // worse than the status quo. Refusing to serve over it would be stricter
    // than the platform.
    const r = resolveTlsConfig(
      read({ [TLS_CERT_KEY]: '/c.crt', [TLS_KEY_KEY]: '/c.key' }),
      deps({ certExpiry: () => null })
    );
    expect(r.mode).toBe('https');
    if (r.mode === 'https') expect(r.expired).toBe(false);
  });

  test('an empty string is treated as unset, not as a path', () => {
    // Both keys ship as "". An empty value must read as "no certificate",
    // never as a file called "".
    expect(resolveTlsConfig(read({ [TLS_CERT_KEY]: '', [TLS_KEY_KEY]: '' }), deps()).mode).toBe('http');
  });
});
