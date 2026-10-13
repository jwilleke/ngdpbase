/**
 * #1762 slice 3 — every audit emitter takes its "who" from the context.
 *
 * The guard is `scripts/check-audit-attribution.ts` (`npm run
 * lint:audit-attribution`, on the pre-commit hook). This runs it under vitest
 * so a regression fails the suite as well as the hook, in the
 * `contextDiscipline` / `permissionSubjectGuard` idiom.
 *
 * Sabotage: change any `...who,` in an audit row back to
 * `user: who.user, ipAddress: who.ipAddress,`, or drop `viaProxy` from a
 * `build…AuditEvent` call, and this goes red — that row would record the
 * represented person and lose the proxy who acted.
 */
import { scan } from '../../scripts/check-audit-attribution';

describe('#1762 every audit row names its "who" from the context', () => {
  test('the audit-attribution guard reports nothing', () => {
    expect(scan().map((v) => `${v.file}${v.line ? `:${v.line}` : ''} [${v.rule}] ${v.detail}`)).toEqual([]);
  });
});
