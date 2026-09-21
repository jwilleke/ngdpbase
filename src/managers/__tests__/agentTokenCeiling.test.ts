/**
 * #1164 — a scoped agent token reached admin rights it can never be minted with.
 *
 * `AgentTokenManager` refuses `admin-*` at mint (`FORBIDDEN_SCOPE_PREFIX`), so
 * no token can legitimately hold `admin-system`. The ceiling in
 * the PDP (`UserManager.hasPermission` until #1431 step 14) is what keeps a token from *inheriting* its
 * owner's admin rights instead — and it could only run when the caller passed a
 * context, because the token rides on the context.
 *
 * Route code could not pass one. `IUserManager` declared
 * `hasPermission(username: string | undefined, …)` — the object form was not
 * offered — so every route was obliged to use the form that silently drops the
 * ceiling. Twelve did; the compiler found eight more once the contract was
 * narrowed, and `AttachmentManager` bypassed it while passing an *object*, by
 * rebuilding one from three fields.
 *
 * These tests assert the property, not the call shape: a token that lacks a
 * scope must be refused, however the check is reached.
 */
vi.unmock('../UserManager');

import type { PermissionSubject } from '../UserManager';
import { makeDecider } from './__fixtures__/decider';

/** A decider whose policy allows everything — so only the ceiling can deny. */
function makeManager() {
  return makeDecider({
    evaluateAccess: () => Promise.resolve({ allowed: true }),
    users: () => ({ username: 'jim', isActive: true }),
    roles: () => ['admin']
  }).pdp;
}

/** An admin who signed in normally — no token involved. */
const human: PermissionSubject = {
  username: 'jim', roles: ['admin', 'All'], isAuthenticated: true
};

/** The same admin, but the request arrived bearing a read-only agent token. */
const viaReadOnlyToken: PermissionSubject = {
  ...human,
  viaToken: { id: 'tok-1', name: 'reader', scopes: ['page-read'] }
};

describe('#1164 — a token cannot exceed its scopes', () => {
  test('a read-only token is refused a destructive admin action', async () => {
    // The vulnerability in one assertion. `requireTrashAdmin` gated
    // "browse and restore every deleted page on the instance" on exactly this
    // check, and a token scoped `page-read` passed it.
    const m = makeManager();
    expect(await m.permits(viaReadOnlyToken, 'admin-system')).toBe(false);
  });

  test('the same admin without a token is allowed', async () => {
    // Proves the refusal above is the ceiling, not a broken policy engine.
    const m = makeManager();
    expect(await m.permits(human, 'admin-system')).toBe(true);
  });

  test('a token IS allowed what it holds', async () => {
    const m = makeManager();
    expect(await m.permits(viaReadOnlyToken, 'page-read')).toBe(true);
  });

  test('a token is refused a non-admin action outside its scopes', async () => {
    // The cap is about scopes, not about the word "admin".
    const m = makeManager();
    expect(await m.permits(viaReadOnlyToken, 'page-edit')).toBe(false);
  });
});

describe('#1164 — the ways the ceiling used to be dropped', () => {
  test('rebuilding a subject from parts loses the token — the AttachmentManager shape', async () => {
    // This is what `AttachmentManager` did on the branch that LOOKED safe: it
    // passed an object, satisfying the declared type exactly, but built from
    // three fields. The rebuilt subject carries no token, so the ceiling finds
    // nothing and the call resolves against the owner's live admin roles.
    //
    // Asserted as a WARNING, not as desired behaviour: it documents why
    // "pass an object" was never a sufficient rule, and why callers must
    // forward the context they were given.
    const m = makeManager();
    const rebuilt: PermissionSubject = {
      username: viaReadOnlyToken.username,
      roles: viaReadOnlyToken.roles,
      isAuthenticated: true
      // viaToken dropped — exactly the bug
    };
    expect(await m.permits(rebuilt, 'admin-system')).toBe(true);

    // Forwarding the original is refused. Same call, same permission; the only
    // difference is whether the token survived the journey.
    expect(await m.permits(viaReadOnlyToken, 'admin-system')).toBe(false);
  });

  test('the username string form also loses the token, which is why routes may not use it', async () => {
    // Still reachable from managers doing a genuine "does user X hold Y?"
    // lookup, where there is no request and no token to consider. Route code
    // is barred from it by the narrowed IUserManager signature, so this can
    // no longer be reached by accident from a request handler.
    const m = makeManager();
    expect(await m.permits('jim', 'admin-system')).toBe(true);
  });
});
