/**
 * #1462 — one code path saves a page.
 *
 * The guard itself is `scripts/check-page-door.ts` (`npm run lint:page-door`,
 * on the pre-commit hook). This test runs it under vitest so a regression
 * fails the suite as well as the hook, in the `contextDiscipline` /
 * `roleNameGates` idiom.
 *
 * Sabotage: update the search index from a route after a save, or write a
 * page's bytes there, and this goes red. Both were everywhere before #1462 —
 * which is how four of the eight route paths that saved a page emitted no
 * audit record (#1121), and how a private page created from a template or
 * renamed through the API reached the shared search index (#1454).
 */
import { scan } from '../../scripts/check-page-door';

describe('#1462 every page write goes through the door, and the shared indexes belong to their owners', () => {
  test('the page-door guard reports nothing', () => {
    expect(scan().map((v) => `${v.file}${v.line ? `:${v.line}` : ''} [${v.rule}] ${v.detail}`)).toEqual([]);
  });
});
