/**
 * #1198 — allow and deny come from `hasPermission` / `canAccess`, never from
 * a role name or a session flag (security-posture P2).
 *
 * The guard itself is `scripts/check-permission-gates.ts` (`npm run
 * lint:gates`, on the pre-commit hook), which scans `src/`, `addons/` and
 * `views/` and keeps every remaining read beside its justification. This test
 * runs it under vitest so a gate that creeps back fails the suite as well as
 * the hook. Sabotage: put `WikiContext.userHasRole(userContext, 'admin')`
 * back in a plugin and this goes red.
 */
import { run } from '../../scripts/check-permission-gates';

describe('#1198 no role-name gate and no isAuthenticated allow outside the justified list', () => {
  test('the permission-gates guard reports nothing', () => {
    expect(run().map((v) => `${v.file}:${v.line} [${v.rule}] ${v.detail}`)).toEqual([]);
  });
});
