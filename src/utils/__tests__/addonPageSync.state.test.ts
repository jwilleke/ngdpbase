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
      stamp: typeof frontmatter[stampKey] === 'string' ? frontmatter[stampKey] : undefined,
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

/**
 * Rows 2 and 3 (#2389, slice 2): a page the admin chose to keep. K is the kept
 * mark, W is "the shipped page's working parts differ from the parts recorded
 * when it was kept". A kept page is checked after row 1 and before E and C.
 */
describe.each(['required-source-hash', 'addon-source-hash'])('shippedPageState, kept pages, with the %s stamp (#2389 slice 2)', (stampKey) => {
  const kept = (over: { shipped: string; live: string; stampedBody?: string; userModified?: boolean; keptShippedBody?: string; keptParts?: string[]; shippedParts?: string[] }) => {
    const frontmatter: Record<string, unknown> = {};
    if (over.stampedBody !== undefined) frontmatter[stampKey] = pageSourceHash(over.stampedBody);
    return shippedPageState({
      shippedBody: over.shipped,
      liveBody: over.live,
      stamp: typeof frontmatter[stampKey] === 'string' ? frontmatter[stampKey] : undefined,
      userModified: over.userModified === true,
      kept: true,
      keptShippedHash: pageSourceHash(over.keptShippedBody ?? 'v1'),
      keptParts: over.keptParts ?? [],
      shippedParts: over.shippedParts ?? []
    });
  };

  test('row 3: edited and kept, nothing new in how the shipped page works', () => {
    const r = kept({ shipped: 'v1', live: 'edited', stampedBody: 'v1', userModified: true });
    expect(r.state).toBe('kept-for-site');
    expect(r.newerAvailable).toBe(false);
    expect(r.workingChanges).toEqual([]);
  });

  test('row 3: a newer wording-only shipped version is only "newer available"', () => {
    const r = kept({ shipped: 'v2', live: 'edited', stampedBody: 'v1', userModified: true, keptShippedBody: 'v1' });
    expect(r.state).toBe('kept-for-site');
    expect(r.newerAvailable).toBe(true);
  });

  test('row 3 beats rows 4 and 5: kept, edited and shipped changed is not Both changed', () => {
    expect(kept({ shipped: 'v2', live: 'edited', stampedBody: 'v1' }).state).toBe('kept-for-site');
    expect(kept({ shipped: 'v1', live: 'edited' }).state).toBe('kept-for-site');
  });

  test('row 2: the shipped page now has a working part the kept one did not', () => {
    const r = kept({
      shipped: 'v2',
      live: 'edited',
      stampedBody: 'v1',
      userModified: true,
      keptParts: [],
      shippedParts: ['plugin:Calendar calendars="family"']
    });
    expect(r.state).toBe('kept-needs-review');
    expect(r.workingChanges).toEqual(['This page now calls Calendar with calendars=family.']);
  });

  test('row 2: a removed working part counts too', () => {
    const r = kept({ shipped: 'v2', live: 'edited', userModified: true, keptParts: ['plugin:Counter'], shippedParts: [] });
    expect(r.state).toBe('kept-needs-review');
  });

  test('a kept page with no recorded baseline is never flagged for a change it cannot name', () => {
    const r = shippedPageState({
      shippedBody: 'v2',
      liveBody: 'edited',
      stamp: pageSourceHash('v1'),
      userModified: true,
      kept: true,
      keptShippedHash: undefined,
      keptParts: undefined,
      shippedParts: ['plugin:Calendar']
    });
    expect(r.state).toBe('kept-for-site');
  });

  test('row 1 comes first: kept, text equals shipped, not flagged, is Same as shipped', () => {
    expect(kept({ shipped: 'v1', live: 'v1', stampedBody: 'v1' }).state).toBe('same-as-shipped');
  });

  test('kept, text equals shipped, flagged, is Kept for this site', () => {
    expect(kept({ shipped: 'v1', live: 'v1', stampedBody: 'v1', userModified: true }).state).toBe('kept-for-site');
  });

  test('without the kept mark the same inputs read as before', () => {
    const r = shippedPageState({
      shippedBody: 'v2',
      liveBody: 'edited',
      stamp: pageSourceHash('v1'),
      userModified: true,
      kept: false,
      keptShippedHash: pageSourceHash('v1'),
      keptParts: [],
      shippedParts: ['plugin:Calendar']
    });
    expect(r.state).toBe('both-changed');
    expect(r.workingChanges).toEqual([]);
  });
});
