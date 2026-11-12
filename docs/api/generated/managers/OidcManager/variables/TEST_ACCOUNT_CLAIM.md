[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/OidcManager](../README.md) / TEST\_ACCOUNT\_CLAIM

# Variable: TEST\_ACCOUNT\_CLAIM

> `const` __TEST\_ACCOUNT\_CLAIM__: `"test_account"` = `'test_account'`

Defined in: src/managers/OidcManager.ts:73

The claim that says the account is a test account (#1805): always a boolean,
so a client can tell "real" (`false`) from "not asked" (absent). Released
with the `profile` scope — the provider drops any claim no scope names.
