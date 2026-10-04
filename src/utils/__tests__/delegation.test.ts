/** #1576 — one rule for what a delegation (agent token, OIDC app) may never carry. */
import { MINT_PERMISSION, refusedDelegatedScope } from '../delegation';

describe('refusedDelegatedScope', () => {
  test('admin-* and token-mint are never delegated; everything else may be', () => {
    expect(refusedDelegatedScope('admin-users')).toMatch(/admin permission/);
    expect(refusedDelegatedScope(MINT_PERMISSION)).toMatch(/never mints a token/);
    expect(refusedDelegatedScope('page-read')).toBeNull();
    expect(refusedDelegatedScope('page-edit')).toBeNull();
  });
});
