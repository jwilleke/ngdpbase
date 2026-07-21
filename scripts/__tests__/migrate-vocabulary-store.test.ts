/**
 * Delta computation for the #896 vocabulary-store migration.
 */
import { describe, test, expect } from 'vitest';
import { computeStoreDelta } from '../migrate-vocabulary-store';

describe('computeStoreDelta (#896)', () => {
  const seed = {
    default: { label: 'default', enabled: true }
  };

  test('entry identical to seed is omitted', () => {
    const store = computeStoreDelta({ default: { label: 'default', enabled: true } }, seed);
    expect(store).toEqual({});
  });

  test('instance-only entry is stored verbatim', () => {
    const snapshot = {
      default: { label: 'default', enabled: true },
      basketball: { label: 'basketball', enabled: true }
    };
    const store = computeStoreDelta(snapshot, seed);
    expect(Object.keys(store)).toEqual(['basketball']);
  });

  test('entry differing from seed is stored', () => {
    const snapshot = { default: { label: 'default', enabled: true, description: 'customized' } };
    const store = computeStoreDelta(snapshot, seed);
    expect(store.default.description).toBe('customized');
  });

  test('seed entry absent from snapshot becomes enabled:false override', () => {
    const store = computeStoreDelta({}, seed);
    expect(store.default.enabled).toBe(false);
  });

  test('existing store entries win over recomputed deltas', () => {
    const snapshot = { basketball: { label: 'basketball', enabled: true } };
    const existing = { basketball: { label: 'basketball', enabled: true, description: 'adopted post-switch' } };
    const store = computeStoreDelta(snapshot, seed, existing);
    expect(store.basketball.description).toBe('adopted post-switch');
  });

  test('idempotent: applying the delta as a new snapshot yields the same delta', () => {
    const snapshot = {
      default: { label: 'default', enabled: true },
      basketball: { label: 'basketball', enabled: true }
    };
    const first = computeStoreDelta(snapshot, seed);
    const second = computeStoreDelta({ ...seed, ...first }, seed, first);
    expect(second).toEqual(first);
  });
});
