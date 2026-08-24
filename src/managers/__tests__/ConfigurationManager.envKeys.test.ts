import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { coerceToTypeOf, describePropertySource } from '../../utils/configEnvKeys.js';

/**
 * #1089 — six config keys were owned by two layers at once: the environment,
 * via a hardcoded map inside `getProperty` that nothing outside could see, and
 * the admin UI, which accepted and persisted edits to them that could never
 * take effect.
 *
 * The fix is a declared map (`ngdpbase.config.env-keys`) replacing the hardcoded
 * one, so the declaration and the mechanism are the same thing and cannot drift.
 * These cover the two pure pieces that logic needs.
 */
describe('coerceToTypeOf', () => {
  // Environment values are always strings; the shipped default carries the type
  // the rest of the code expects. `ngdpbase.server.port` is declared `number`
  // and ships as 3000, so NGDPBASE_PORT=3001 must not arrive as "3001".
  it('coerces to number when the default is a number', () => {
    expect(coerceToTypeOf('3001', 3000)).toBe(3001);
  });

  it('leaves a string as a string when the default is a string', () => {
    expect(coerceToTypeOf('My Wiki', 'ngdp-instance')).toBe('My Wiki');
  });

  it('coerces "true"/"false" when the default is a boolean', () => {
    expect(coerceToTypeOf('true', false)).toBe(true);
    expect(coerceToTypeOf('false', true)).toBe(false);
  });

  it('treats any other string as false when the default is a boolean', () => {
    // Only an explicit "true" enables something. "yes"/"1" silently meaning
    // true is the kind of guess that surprises an operator later.
    expect(coerceToTypeOf('yes', false)).toBe(false);
  });

  it('returns the raw string when the default is null or undefined', () => {
    // No default means no type to copy, so there is nothing to infer from.
    expect(coerceToTypeOf('anything', null)).toBe('anything');
    expect(coerceToTypeOf('anything', undefined)).toBe('anything');
  });

  it('returns the raw string when a numeric default meets a non-numeric value', () => {
    // Better to hand the caller something visibly wrong than a silent NaN.
    expect(coerceToTypeOf('not-a-number', 3000)).toBe('not-a-number');
  });

  it('does not coerce an object default', () => {
    expect(coerceToTypeOf('x', { a: 1 })).toBe('x');
  });
});

describe('describePropertySource', () => {
  const ENV_KEYS = {
    'ngdpbase.server.port': 'NGDPBASE_PORT',
    'ngdpbase.application-name': 'NGDPBASE_APP_NAME'
  };

  it('reports env ownership and the variable name, even when the variable is unset', () => {
    // The heart of the design: ownership is declared, not conditional on the
    // variable being set. A conditional would make the UI the source of truth
    // whenever the variable is absent.
    const d = describePropertySource('ngdpbase.server.port', ENV_KEYS, {}, 3000);
    expect(d.envControlled).toBe(true);
    expect(d.envVar).toBe('NGDPBASE_PORT');
  });

  it('reports the environment value as effective when the variable is set', () => {
    const d = describePropertySource('ngdpbase.server.port', ENV_KEYS, { NGDPBASE_PORT: '3001' }, 3000);
    expect(d.effective).toBe(3001);
    expect(d.source).toBe('env');
  });

  it('reports the config value as effective when the variable is unset', () => {
    // Still env-controlled — the shipped value is a boot fallback, not a
    // setting — but it is what is actually in force right now, and the UI has
    // to show the truth.
    const d = describePropertySource('ngdpbase.server.port', ENV_KEYS, {}, 3000);
    expect(d.effective).toBe(3000);
    expect(d.source).toBe('config');
    expect(d.envControlled).toBe(true);
  });

  it('ignores an empty environment value rather than treating it as set', () => {
    // `NGDPBASE_PORT=` in a .env is an operator clearing it, not setting it to
    // the empty string.
    const d = describePropertySource('ngdpbase.server.port', ENV_KEYS, { NGDPBASE_PORT: '' }, 3000);
    expect(d.source).toBe('config');
    expect(d.effective).toBe(3000);
  });

  it('reports a key not in the map as not env-controlled', () => {
    const d = describePropertySource('ngdpbase.front-page', ENV_KEYS, {}, 'Welcome');
    expect(d.envControlled).toBe(false);
    expect(d.envVar).toBeNull();
    expect(d.effective).toBe('Welcome');
  });

  it('coerces the environment value to the default type', () => {
    const d = describePropertySource('ngdpbase.server.port', ENV_KEYS, { NGDPBASE_PORT: '8080' }, 3000);
    expect(d.effective).toBe(8080);
    expect(typeof d.effective).toBe('number');
  });

  it('handles a missing map without throwing', () => {
    const d = describePropertySource('ngdpbase.server.port', null, {}, 3000);
    expect(d.envControlled).toBe(false);
    expect(d.effective).toBe(3000);
  });
});
