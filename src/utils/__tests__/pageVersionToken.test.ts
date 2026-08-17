/**
 * #1061 — optimistic concurrency tokens for page saves.
 *
 * These tests pin two things that pull against each other, and the second is
 * the one that will break first:
 *
 *   - a save built on a superseded version is detected, and
 *   - every case the check cannot reason about is ALLOWED through.
 *
 * The second matters because the failure mode of a concurrency check is not
 * "misses a conflict" — it is "refuses saves that were always fine", which
 * reads to a user as the editor being broken and gets the check ripped out.
 */

import { describe, test, expect } from 'vitest';
import { versionTokenOf, isStaleSave } from '../pageVersionToken';

describe('#1061 — versionTokenOf', () => {
  test('reads a quoted ISO string, the normal case', () => {
    expect(versionTokenOf({ lastModified: '2026-04-21T15:14:34.355Z' }))
      .toBe('2026-04-21T15:14:34.355Z');
  });

  test('reads a Date, which is what unquoted YAML frontmatter parses to', () => {
    // The failure this prevents is a FALSE conflict: comparing a Date object to
    // the string a form posted back never matches, so every save on such a page
    // would be refused.
    const d = new Date('2026-04-21T15:14:34.355Z');
    expect(versionTokenOf({ lastModified: d })).toBe('2026-04-21T15:14:34.355Z');
  });

  test('a quoted and an unquoted write of the same instant produce the same token', () => {
    expect(versionTokenOf({ lastModified: new Date('2026-04-21T15:14:34.355Z') }))
      .toBe(versionTokenOf({ lastModified: '2026-04-21T15:14:34.355Z' }));
  });

  test('accepts an epoch number', () => {
    expect(versionTokenOf({ lastModified: 1776783274355 }))
      .toBe(new Date(1776783274355).toISOString());
  });

  test('keeps an unparseable string as an opaque token rather than discarding it', () => {
    // Still detects change, which is all the comparison needs.
    expect(versionTokenOf({ lastModified: 'not-a-date' })).toBe('not-a-date');
  });

  test.each([
    ['missing metadata', undefined],
    ['null metadata', null],
    ['no lastModified', {}],
    ['empty string', { lastModified: '   ' }],
    ['invalid Date', { lastModified: new Date('nonsense') }],
    ['wrong type', { lastModified: { nested: true } }]
  ])('returns null for %s', (_label, metadata) => {
    expect(versionTokenOf(metadata as never)).toBeNull();
  });
});

describe('#1061 — isStaleSave detects a superseded base', () => {
  test('the page moved after the editor loaded it', () => {
    expect(isStaleSave('2026-04-21T15:14:34.355Z', '2026-04-21T16:00:00.000Z')).toBe(true);
  });

  test('the base matches, so the save proceeds', () => {
    expect(isStaleSave('2026-04-21T15:14:34.355Z', '2026-04-21T15:14:34.355Z')).toBe(false);
  });

  test('surrounding whitespace from the form round trip does not fake a conflict', () => {
    expect(isStaleSave('  2026-04-21T15:14:34.355Z  ', '2026-04-21T15:14:34.355Z')).toBe(false);
  });

  test('a differently-formatted but identical instant is not a conflict', () => {
    // The editor was handed the value straight out of YAML; it may come back
    // with a +00:00 offset instead of Z. Same instant, same version.
    expect(isStaleSave('2026-04-21T15:14:34.355+00:00', '2026-04-21T15:14:34.355Z')).toBe(false);
  });

  test('a one-millisecond difference is still a conflict', () => {
    expect(isStaleSave('2026-04-21T15:14:34.355Z', '2026-04-21T15:14:34.356Z')).toBe(true);
  });
});

describe('#1061 — isStaleSave allows everything it cannot judge', () => {
  test.each([
    ['no base submitted — API clients and older cached forms', undefined, '2026-04-21T15:14:34.355Z'],
    ['empty base', '', '2026-04-21T15:14:34.355Z'],
    ['null base', null, '2026-04-21T15:14:34.355Z'],
    ['page has no token of its own', '2026-04-21T15:14:34.355Z', null],
    ['neither side has one', null, null]
  ])('%s', (_label, base, current) => {
    // Each of these is a deliberate allow. A missing token is not evidence of a
    // conflict, and refusing on absence would break saves that never had this
    // problem.
    expect(isStaleSave(base as never, current as never)).toBe(false);
  });
});
