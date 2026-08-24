import { describe, it, expect } from 'vitest';
import { resolveListenPort, DEFAULT_LISTEN_PORT } from '../resolveListenPort.js';

/**
 * #1090 — `ngdpbase.server.port` was not the port the server bound to.
 *
 * `app.listen` runs at boot step 3, before `engine.initialize()` at step 4, so
 * there is no ConfigurationManager to ask. It therefore read
 * `process.env.PORT` directly and never consulted the config key at all — while
 * a *later* line (`app.ts:743`) resolved a "port" through the config layer for
 * display and the base URL. The two could disagree, and with `PORT=3000` in the
 * shipped `.env.example` the key could never change the bound port.
 *
 * This resolver is the shared answer both sites use. It deliberately takes the
 * config values as plain arguments rather than reaching for a manager, because
 * its whole reason to exist is running before one is available.
 */
describe('resolveListenPort', () => {
  const NO_CONFIG = {};

  describe('precedence', () => {
    it('prefers PORT above everything — containers set it and must win', () => {
      expect(resolveListenPort({ PORT: '4000', NGDPBASE_PORT: '5000' }, { 'ngdpbase.server.port': 6000 }))
        .toBe(4000);
    });

    it('falls back to NGDPBASE_PORT when PORT is unset', () => {
      // Keeps the documented env override working; #1089 declares it as the
      // variable that owns this key.
      expect(resolveListenPort({ NGDPBASE_PORT: '5000' }, { 'ngdpbase.server.port': 6000 }))
        .toBe(5000);
    });

    it('falls back to the config value when neither variable is set — the #1090 fix', () => {
      // This is the case that previously could not happen: the key was never
      // consulted by app.listen.
      expect(resolveListenPort({}, { 'ngdpbase.server.port': 6000 })).toBe(6000);
    });

    it('falls back to the built-in default when nothing is configured', () => {
      expect(resolveListenPort({}, NO_CONFIG)).toBe(DEFAULT_LISTEN_PORT);
    });
  });

  describe('coercion', () => {
    it('accepts a numeric string from the environment', () => {
      expect(resolveListenPort({ PORT: '8080' }, NO_CONFIG)).toBe(8080);
    });

    it('accepts a numeric string from config', () => {
      // An operator editing JSON by hand may quote it.
      expect(resolveListenPort({}, { 'ngdpbase.server.port': '8080' })).toBe(8080);
    });

    it('tolerates surrounding whitespace', () => {
      expect(resolveListenPort({ PORT: ' 8080 ' }, NO_CONFIG)).toBe(8080);
    });
  });

  describe('rejecting values that would bind the wrong socket', () => {
    // parseInt('80abc') is 80. Silently binding 80 because someone typo'd is
    // worse than ignoring the value, so the whole string must be numeric.
    it('ignores a value with trailing garbage rather than parsing a prefix', () => {
      expect(resolveListenPort({ PORT: '80abc' }, { 'ngdpbase.server.port': 6000 })).toBe(6000);
    });

    it('ignores a non-numeric value', () => {
      expect(resolveListenPort({ PORT: 'not-a-port' }, NO_CONFIG)).toBe(DEFAULT_LISTEN_PORT);
    });

    it('ignores an empty or whitespace-only value', () => {
      expect(resolveListenPort({ PORT: '' }, { 'ngdpbase.server.port': 6000 })).toBe(6000);
      expect(resolveListenPort({ PORT: '   ' }, { 'ngdpbase.server.port': 6000 })).toBe(6000);
    });

    it('ignores a port outside the valid TCP range', () => {
      expect(resolveListenPort({ PORT: '0' }, NO_CONFIG)).toBe(DEFAULT_LISTEN_PORT);
      expect(resolveListenPort({ PORT: '70000' }, NO_CONFIG)).toBe(DEFAULT_LISTEN_PORT);
      expect(resolveListenPort({ PORT: '-1' }, NO_CONFIG)).toBe(DEFAULT_LISTEN_PORT);
    });

    it('ignores a non-integer', () => {
      expect(resolveListenPort({ PORT: '80.5' }, NO_CONFIG)).toBe(DEFAULT_LISTEN_PORT);
    });

    it('falls through to the next source rather than to the default', () => {
      // A bad PORT must not discard a perfectly good configured value.
      expect(resolveListenPort({ PORT: 'nonsense' }, { 'ngdpbase.server.port': 6000 })).toBe(6000);
    });
  });

  describe('unresolved env-ref templates', () => {
    it('ignores a config value that still contains a ${VAR} placeholder', () => {
      // This resolver runs before ConfigurationManager, so nothing has expanded
      // `${VAR}` yet. Treating the literal as a port would be nonsense; falling
      // through to the default is the safe reading.
      expect(resolveListenPort({}, { 'ngdpbase.server.port': '${PORT}' })).toBe(DEFAULT_LISTEN_PORT);
    });
  });

  describe('robustness', () => {
    it('handles a null or undefined config object', () => {
      expect(resolveListenPort({}, null)).toBe(DEFAULT_LISTEN_PORT);
      expect(resolveListenPort({}, undefined)).toBe(DEFAULT_LISTEN_PORT);
    });

    it('handles a null config value', () => {
      expect(resolveListenPort({}, { 'ngdpbase.server.port': null })).toBe(DEFAULT_LISTEN_PORT);
    });

    it('is pure — the same inputs always give the same answer', () => {
      const env = { PORT: '4000' };
      expect(resolveListenPort(env, NO_CONFIG)).toBe(resolveListenPort(env, NO_CONFIG));
    });
  });
});
