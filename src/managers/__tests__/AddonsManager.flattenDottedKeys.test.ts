/**
 * Tests for the `flattenDottedKeys` helper (#534 defensive).
 *
 * Background: `express.urlencoded({ extended: true })` keeps dotted form-field
 * names FLAT by default — `body['journal.x']` directly, not `body.journal.x`.
 * Verified live via `node -e "qs.parse('a.b=c')"`. But a future body-parser
 * config change (e.g. someone enables `allowDots: true` for another addon's
 * needs) would silently break addons that rely on flat lookups. AddonsManager
 * normalizes the body shape before fan-out so addons get a stable contract.
 *
 * These tests pin the contract.
 */

vi.unmock('../AddonsManager');

import { flattenDottedKeys } from '../AddonsManager';

describe('flattenDottedKeys', () => {
  it('passes flat dotted keys through unchanged', () => {
    const input = {
      'journal.defaultTemplate': 'daily',
      'journal.voiceToText': 'on',
      'display.theme': 'dark'
    };
    expect(flattenDottedKeys(input)).toEqual(input);
  });

  it('flattens nested plain objects into dotted keys', () => {
    const input = {
      journal: { defaultTemplate: 'daily', voiceToText: 'on' },
      display: { theme: 'dark' }
    };
    expect(flattenDottedKeys(input)).toEqual({
      'journal.defaultTemplate': 'daily',
      'journal.voiceToText': 'on',
      'display.theme': 'dark'
    });
  });

  it('recurses through multi-level nesting', () => {
    const input = {
      editor: { plain: { smartpairs: 'on', autoindent: 'on' } }
    };
    expect(flattenDottedKeys(input)).toEqual({
      'editor.plain.smartpairs': 'on',
      'editor.plain.autoindent': 'on'
    });
  });

  it('preserves arrays as-is (does NOT flatten element-wise)', () => {
    // qs produces sensible arrays for name="x[]" inputs; we should not split them.
    const input = {
      'allowedAuthMethods': ['google-oidc', 'password']
    };
    expect(flattenDottedKeys(input)).toEqual({
      'allowedAuthMethods': ['google-oidc', 'password']
    });
  });

  it('preserves primitive types: string, number, boolean, null', () => {
    const input = {
      str: 'x',
      num: 42,
      bool: true,
      none: null
    };
    expect(flattenDottedKeys(input)).toEqual(input);
  });

  it('preserves non-plain objects (Date, etc.) as-is without recursing into them', () => {
    // Defensive: a Map / Date / class instance shouldn't have its properties
    // walked. Only plain objects (Object.prototype-prototyped) are flattened.
    const now = new Date(2026, 0, 1);
    const input = { ts: now };
    expect(flattenDottedKeys(input)).toEqual({ ts: now });
  });

  it('mixed input — handles both flat and nested at the same level', () => {
    // qs with allowDots could produce a body where some keys are nested and
    // others flat. Both should land flat on the output.
    const input = {
      'display.theme': 'dark',
      journal: { defaultTemplate: 'daily' }
    };
    expect(flattenDottedKeys(input)).toEqual({
      'display.theme': 'dark',
      'journal.defaultTemplate': 'daily'
    });
  });

  it('returns an empty object on empty input', () => {
    expect(flattenDottedKeys({})).toEqual({});
  });

  it('does not mutate the input', () => {
    const input = { journal: { x: '1' } };
    const snapshot = JSON.parse(JSON.stringify(input));
    flattenDottedKeys(input);
    expect(input).toEqual(snapshot);
  });
});
