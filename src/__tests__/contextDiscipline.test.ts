/**
 * #1399 — a door takes the caller's context, mandatory and positional, and
 * uses it (security-posture P1).
 *
 * The guard itself is `scripts/check-context-discipline.ts` (`npm run
 * lint:context`, on the pre-commit hook). This test runs it under vitest so a
 * regression fails the suite as well as the hook, in the `roleNameGates` /
 * `permissionSubjectGuard` idiom.
 *
 * Sabotage: make a `ctx` parameter optional on a manager or provider door, or
 * rename one to `_ctx` and stop forwarding it, and this goes red — which is
 * exactly how `FileSystemProvider.deletePage` came to resolve a page without
 * the context it had been handed, so a sealed page could not be deleted.
 */
import { scan } from '../../scripts/check-context-discipline';

describe('#1399 no ambient, optional, or discarded caller context outside the justified list', () => {
  test('the context-discipline guard reports nothing', () => {
    expect(scan().map((v) => `${v.file}${v.line ? `:${v.line}` : ''} [${v.rule}] ${v.detail}`)).toEqual([]);
  });
});
