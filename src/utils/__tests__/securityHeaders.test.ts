/**
 * #1488 — browser security headers.
 */
import { CSP_POLICY, cspModeOf, securityHeaders } from '../securityHeaders';

describe('security headers (#1488)', () => {
  test('report-only (the default) reports the policy and blocks nothing', () => {
    const h = securityHeaders('report-only');
    expect(h['Content-Security-Policy-Report-Only']).toBe(CSP_POLICY);
    expect(h['Content-Security-Policy']).toBeUndefined();
    expect(h['X-Frame-Options']).toBeUndefined();
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  test('enforce sends the policy and refuses framing by other sites', () => {
    const h = securityHeaders('enforce');
    expect(h['Content-Security-Policy']).toBe(CSP_POLICY);
    expect(h['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(h['Content-Security-Policy-Report-Only']).toBeUndefined();
  });

  test('off sends nothing; an unrecognised value is report-only', () => {
    expect(securityHeaders('off')).toEqual({});
    expect(cspModeOf('bogus')).toBe('report-only');
    expect(cspModeOf(undefined)).toBe('report-only');
    expect(cspModeOf('enforce')).toBe('enforce');
  });

  test('the policy has no script-src: inline scripts are #1489, and an unsafe-inline policy would not protect', () => {
    expect(CSP_POLICY).not.toContain('script-src');
    expect(CSP_POLICY).toContain("frame-ancestors 'self'");
    expect(CSP_POLICY).toContain("object-src 'none'");
  });
});
