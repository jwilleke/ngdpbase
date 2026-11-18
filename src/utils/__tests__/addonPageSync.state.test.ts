/**
 * shippedPageState: the decision table of docs/design/required-pages-sync-states.md
 * (#2389, slice 1 — rows 1, 4, 5 and 6; the kept rows come in slice 2).
 *
 * Core pages stamp `required-source-hash`, add-on pages `addon-source-hash`.
 * Each case runs once per key and must give the same answer: the screen and
 * Sync read the stamp from the live front-matter, and the state must not
 * depend on which key it was under.
 */
import { shippedPageState, pageSourceHash } from '../addonPageSync';

type Case = {
  name: string;
  shipped: string;
  live: string;
  /** Body the stamp hashes, or undefined for a page with no stamp. */
  stampedBody?: string;
  userModified?: boolean;
  state: string;
};

const cases: Case[] = [
  // Row 1: L = S and not U
  { name: 'row 1: text equals shipped, not flagged', shipped: 'v1', live: 'v1', stampedBody: 'v1', state: 'same-as-shipped' },
  { name: 'row 1: text equals shipped, no stamp, not flagged', shipped: 'v1', live: 'v1', state: 'same-as-shipped' },
  { name: 'row 1: text equals shipped, stamp is of an older body', shipped: 'v2', live: 'v2', stampedBody: 'v1', state: 'same-as-shipped' },
  // Row 6: C and not E
  { name: 'row 6: never edited, shipped body changed', shipped: 'v2', live: 'v1', stampedBody: 'v1', state: 'update-ready' },
  // Row 5: E and not C
  { name: 'row 5: edited here, shipped unchanged', shipped: 'v1', live: 'edited', stampedBody: 'v1', state: 'edited-not-confirmed' },
  { name: 'row 5: flagged, text still equals the shipped text (Q1: title or keywords only)', shipped: 'v1', live: 'v1', stampedBody: 'v1', userModified: true, state: 'edited-not-confirmed' },
  { name: 'row 5: flagged, no stamp, text equals shipped', shipped: 'v1', live: 'v1', userModified: true, state: 'edited-not-confirmed' },
  { name: 'row 5: no stamp and the body differs (R7: never replaced)', shipped: 'v2', live: 'v1', state: 'edited-not-confirmed' },
  { name: 'row 5: flagged, body equals its stamp, shipped unchanged', shipped: 'v1', live: 'v1', stampedBody: 'v1', userModified: true, state: 'edited-not-confirmed' },
  // Row 4: E and C
  { name: 'row 4: edited here and shipped changed', shipped: 'v2', live: 'edited', stampedBody: 'v1', state: 'both-changed' },
  { name: 'row 4: flagged, body equals its stamp, shipped changed', shipped: 'v2', live: 'v1', stampedBody: 'v1', userModified: true, state: 'both-changed' }
];

describe.each(['required-source-hash', 'addon-source-hash'])('shippedPageState with the %s stamp (#2389)', (stampKey) => {
  const stateOf = (c: Case): string => {
    const frontmatter: Record<string, unknown> = c.userModified ? { 'user-modified': true } : {};
    if (c.stampedBody !== undefined) frontmatter[stampKey] = pageSourceHash(c.stampedBody);
    return shippedPageState({
      shippedBody: c.shipped,
      liveBody: c.live,
      stamp: typeof frontmatter[stampKey] === 'string' ? (frontmatter[stampKey]) : undefined,
      userModified: frontmatter['user-modified'] === true
    }).state;
  };

  test.each(cases)('$name', (c) => {
    expect(stateOf(c)).toBe(c.state);
  });

  test('a trailing newline is not a difference', () => {
    expect(stateOf({ name: '', shipped: 'v1\n', live: 'v1', stampedBody: 'v1', state: '' })).toBe('same-as-shipped');
  });
});
