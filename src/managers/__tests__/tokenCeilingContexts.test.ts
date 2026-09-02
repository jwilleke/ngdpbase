/**
 * #1173 Part B — one code path, and the context classes stopped losing tokens.
 *
 * #1164 fixed route code. It did not fix the context classes, because the guard
 * it added only scanned `src/routes/`. `ApiContext` and `ParseContext` each
 * rebuilt a three-field subject and dropped `viaToken`, and `ApiContext` did
 * not even capture it at construction — so every addon API route using
 * `ctx.requirePermission()` resolved against the token OWNER's live roles with
 * the scope ceiling unable to run.
 *
 * These assert the property that matters: a scoped token is capped no matter
 * which context class the check goes through.
 */
vi.unmock('../UserManager');

import UserManager from '../UserManager';
import { ApiContext } from '../../context/ApiContext';

const token = { id: 'tok-1', name: 'reader', scopes: ['page-read'] };

/** A UserManager whose policy engine allows everything — only the ceiling can deny. */
function makeUserManager() {
  const m = new UserManager({
    getManager: (n: string) =>
      (n === 'PolicyEvaluator' ? { evaluateAccess: () => Promise.resolve({ allowed: true }) } : null)
  });
  (m as unknown as { provider: unknown }).provider = {
    getUser: () => Promise.resolve({ username: 'jim', isActive: true, roles: ['admin'] })
  };
  return m;
}

function makeEngine(um: UserManager) {
  return { getManager: (n: string) => (n === 'UserManager' ? um : null) } as never;
}

describe('#1173 — ApiContext carries the token through', () => {
  test('a read-only token is refused an admin permission', async () => {
    const um = makeUserManager();
    const req = {
      userContext: { username: 'jim', roles: ['admin', 'All'], isAuthenticated: true, viaToken: token }
    } as never;
    const ctx = ApiContext.from(req, makeEngine(um));

    expect(ctx.viaToken).toEqual(token);          // captured at construction
    expect(await ctx.hasPermission('admin-system')).toBe(false);   // and honoured
  });

  test('the same admin without a token is allowed', async () => {
    // Proves the refusal is the ceiling, not a broken policy engine.
    const um = makeUserManager();
    const req = {
      userContext: { username: 'jim', roles: ['admin', 'All'], isAuthenticated: true }
    } as never;
    const ctx = ApiContext.from(req, makeEngine(um));
    expect(await ctx.hasPermission('admin-system')).toBe(true);
  });

  test('a token IS allowed what it holds', async () => {
    const um = makeUserManager();
    const req = {
      userContext: { username: 'jim', roles: ['admin', 'All'], isAuthenticated: true, viaToken: token }
    } as never;
    expect(await ApiContext.from(req, makeEngine(um)).hasPermission('page-read')).toBe(true);
  });
});

describe('#1173 — the lookup question keeps its own name', () => {
  test('userHoldsPermission looks the user up and answers from their live roles', async () => {
    // The username form of `hasPermission` is gone — it could not carry a
    // token, so the ceiling had nothing to read, which is how #1164 reached
    // seventeen call sites. TypeScript now rejects a string there, so there is
    // no runtime behaviour left to assert.
    //
    // The question that form was really asking — "does this NAMED USER hold
    // this permission?" — is legitimate: no request, no token, nothing to drop.
    // It survives under its own name.
    const um = makeUserManager();
    expect(await um.userHoldsPermission('jim', 'admin-system')).toBe(true);
  });

  test('an unknown user is refused rather than resolving to anonymous rights', async () => {
    const um = makeUserManager();
    (um as unknown as { provider: { getUser: () => Promise<null> } }).provider = {
      getUser: () => Promise.resolve(null)
    };
    expect(await um.userHoldsPermission('nobody', 'page-read')).toBe(false);
  });
});
