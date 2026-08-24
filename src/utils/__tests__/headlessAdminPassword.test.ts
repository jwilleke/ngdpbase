import { describe, it, expect } from 'vitest';
import { assertHeadlessBootstrapPassword, SHIPPED_BOOTSTRAP_PASSWORD } from '../headlessAdminPassword.js';

/**
 * #1087 — `InstallService` documented a safety property the code did not have:
 *
 *   "There is no default — a headless install with that variable unset
 *    refuses to start."
 *
 * It did not refuse. `ngdpbase.user.security.defaultpassword` ships as the
 * literal `admin123` and `getBootstrapPassword()` falls back to a matching
 * hardcoded constant, so a headless container or k8s deploy with
 * `NGDPBASE_ADMIN_PASSWORD` unset came up on a well-known credential —
 * failing *open* where the documentation said it failed *closed*.
 *
 * The interactive path is deliberately untouched: a fresh local install coming
 * up unattended so the setup wizard is reachable is a documented, wanted
 * property, and there is a human present to read the startup banner. An
 * unattended deploy has neither.
 */
describe('assertHeadlessBootstrapPassword', () => {
  describe('when not a headless install', () => {
    it('permits the shipped default — the wizard needs a reachable admin', () => {
      expect(() => assertHeadlessBootstrapPassword(SHIPPED_BOOTSTRAP_PASSWORD, false)).not.toThrow();
    });

    it('permits any password', () => {
      expect(() => assertHeadlessBootstrapPassword('anything', false)).not.toThrow();
    });
  });

  describe('when headless', () => {
    it('refuses the shipped default — the documented behaviour, now real', () => {
      expect(() => assertHeadlessBootstrapPassword(SHIPPED_BOOTSTRAP_PASSWORD, true)).toThrow();
    });

    it('names the variable and the config key so the message is actionable', () => {
      let message = '';
      try {
        assertHeadlessBootstrapPassword(SHIPPED_BOOTSTRAP_PASSWORD, true);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain('NGDPBASE_ADMIN_PASSWORD');
      expect(message).toContain('ngdpbase.user.security.defaultpassword');
      expect(message).toContain('HEADLESS_INSTALL');
    });

    it('does not put the password itself in the error', () => {
      // The value is well-known, but echoing a credential into container logs
      // is a habit worth not forming.
      let message = '';
      try {
        assertHeadlessBootstrapPassword(SHIPPED_BOOTSTRAP_PASSWORD, true);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).not.toContain(SHIPPED_BOOTSTRAP_PASSWORD);
    });

    it('permits a password the operator actually set', () => {
      expect(() => assertHeadlessBootstrapPassword('a-real-secret', true)).not.toThrow();
    });

    it('refuses an empty password', () => {
      // Nothing configured at all is the same hazard as the shipped default.
      expect(() => assertHeadlessBootstrapPassword('', true)).toThrow();
      expect(() => assertHeadlessBootstrapPassword('   ', true)).toThrow();
    });

    it('refuses regardless of surrounding whitespace on the shipped default', () => {
      // A config value of " admin123 " is the shipped credential with a typo,
      // not a deliberate choice.
      expect(() => assertHeadlessBootstrapPassword(' admin123 ', true)).toThrow();
    });
  });

  it('exports the shipped default so callers need not hardcode it twice', () => {
    expect(SHIPPED_BOOTSTRAP_PASSWORD).toBe('admin123');
  });
});
