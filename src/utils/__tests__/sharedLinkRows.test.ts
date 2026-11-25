/**
 * The row function of the Shared links page, slice 3 of #2247 (R1, R2, R3, R5, R9).
 * One function: the page lists with it and the Profile card counts with it.
 */

import { sharedLinkRows, sharedLinkCounts } from '../sharedLinkRows';
import type { ShareRecord } from '../../types/Share';

const NOW = Date.parse('2026-11-25T12:00:00.000Z');
const base = { token: 'a'.repeat(64), createdBy: 'molly', createdAt: '2026-11-01T00:00:00.000Z', expiresAt: null, actions: [], resources: [] };

const TAG = { ...base, id: 'r1', scope: { kind: 'keyword', keyword: 'Garden' } } as unknown as ShareRecord;
const CHOSEN = { ...base, id: 'r2', createdAt: '2026-11-02T00:00:00.000Z', scope: { kind: 'vault', owner: 'molly', vault: 'Journal', pages: ['u1', 'u2', 'u3'] } } as unknown as ShareRecord;
const WHOLE = { ...base, id: 'r3', createdAt: '2026-11-03T00:00:00.000Z', scope: { kind: 'vault', owner: 'molly', vault: 'Family', pages: null } } as unknown as ShareRecord;
const ALL = { tag: true, vault: true };

describe('sharedLinkRows (slice 3 of #2247)', () => {
  test('one link of each kind gives three rows, newest first, with the right text and actions', () => {
    const rows = sharedLinkRows([TAG, CHOSEN, WHOLE], ALL, NOW);
    expect(rows.map((r) => r.id)).toEqual(['r3', 'r2', 'r1']);
    expect(rows.map((r) => r.kind)).toEqual(['whole-area', 'chosen-pages', 'tag']);
    expect(rows.map((r) => r.what)).toEqual(['All of your Family vault', '3 pages in your Journal vault', 'Everything tagged Garden']);
    expect(rows[2].actions).toEqual(['revoke']);
    expect(rows[1].actions).toEqual(['extend', 'visits', 'revoke']);
    expect(rows.every((r) => r.status === 'active')).toBe(true);
  });

  test('a link a manager revoked reads "page not available" and holds no manager name', () => {
    const [row] = sharedLinkRows([{ ...TAG, revokedAt: '2026-11-10T00:00:00.000Z', revokedByManager: true }], ALL, NOW);
    expect(row.status).toBe('page not available');
    expect(row.actions).toEqual([]);
    expect(JSON.stringify(row)).not.toMatch(/root|admin|manager/i);
  });

  test('a link its owner revoked reads "revoked"; an old one reads "expired"', () => {
    const rows = sharedLinkRows([
      { ...TAG, id: 'a', revokedAt: '2026-11-10T00:00:00.000Z' },
      { ...TAG, id: 'b', expiresAt: '2026-11-20T00:00:00.000Z' }
    ], ALL, NOW);
    expect(rows.map((r) => r.status)).toEqual(['revoked', 'expired']);
    expect(rows.every((r) => r.actions.length === 0)).toBe(true);
  });

  test('links of a kind the user may no longer make are hidden', () => {
    expect(sharedLinkRows([TAG, CHOSEN, WHOLE], { tag: false, vault: true }, NOW).map((r) => r.kind)).toEqual(['whole-area', 'chosen-pages']);
    expect(sharedLinkRows([TAG, CHOSEN, WHOLE], { tag: true, vault: false }, NOW).map((r) => r.kind)).toEqual(['tag']);
  });

  test('no row carries a token', () => {
    expect(JSON.stringify(sharedLinkRows([TAG, CHOSEN, WHOLE], ALL, NOW))).not.toContain('a'.repeat(64));
  });

  test('the Profile card counts equal the rows, with a revoked and an expired link', () => {
    const records = [TAG, CHOSEN, WHOLE,
      { ...TAG, id: 'x', revokedAt: '2026-11-10T00:00:00.000Z' },
      { ...TAG, id: 'y', expiresAt: '2026-11-20T00:00:00.000Z' }];
    const rows = sharedLinkRows(records, ALL, NOW);
    expect(sharedLinkCounts(records, ALL, NOW)).toEqual({ active: 3, total: 5 });
    expect(sharedLinkCounts(records, ALL, NOW)).toEqual({ active: rows.filter((r) => r.status === 'active').length, total: rows.length });
  });
});
