/** #1576 — one rule for what a delegation (agent token, OIDC app) may never carry. */
import { EXTEND_PERMISSION, MINT_PERMISSION, PROXY_GRANT_PERMISSION, VAULT_PROXY_PERMISSION, lackingScopes, refusedDelegatedScope, requireScopeList } from '../delegation';

describe('refusedDelegatedScope', () => {
  test('admin-*, token-mint, token-extend, proxy-grant and vault-proxy are never delegated; everything else may be', () => {
    expect(refusedDelegatedScope('admin-users')).toMatch(/admin permission/);
    expect(refusedDelegatedScope(MINT_PERMISSION)).toMatch(/never mints a token/);
    expect(refusedDelegatedScope(EXTEND_PERMISSION)).toMatch(/never extends a token/);
    expect(refusedDelegatedScope(PROXY_GRANT_PERMISSION)).toMatch(/never lets someone act for you/);
    expect(refusedDelegatedScope(VAULT_PROXY_PERMISSION)).toMatch(/only for proxy grants/);
    expect(refusedDelegatedScope('page-read')).toBeNull();
    expect(refusedDelegatedScope('page-edit')).toBeNull();
  });
});

// #1762: the scope rules agent tokens and proxy grants share.
describe('requireScopeList / lackingScopes', () => {
  test('a list of at least one non-empty name, de-duplicated in order', () => {
    expect(() => requireScopeList([])).toThrow(/At least one scope/);
    expect(() => requireScopeList('page-read')).toThrow(/At least one scope/);
    expect(() => requireScopeList(['page-read', ' '])).toThrow(/non-empty string/);
    expect(requireScopeList(['page-read', 'page-edit', 'page-read'])).toEqual(['page-read', 'page-edit']);
  });

  test('names the scopes the delegator does not hold, in order', async () => {
    const held = new Set(['page-read']);
    expect(await lackingScopes(['page-edit', 'page-read', 'admin-system'], s => Promise.resolve(held.has(s)))).toEqual(['page-edit', 'admin-system']);
    expect(await lackingScopes(['page-read'], s => Promise.resolve(held.has(s)))).toEqual([]);
  });
});
