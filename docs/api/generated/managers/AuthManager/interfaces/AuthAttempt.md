[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / AuthAttempt

# Interface: AuthAttempt

Defined in: src/managers/AuthManager.ts:1093

Where an authentication attempt came from, and why (#1758). AuthManager is
the one door for every check of a secret, and writes the audit record of a
sign-in method's check itself; routes write none.

- `sign-in` (default): a person signing in; a success counts on the account.
- `re-check`: proving it again before a change (a password re-entered on the
  profile, a store door); audited, never counted as a sign-in.

## Properties

### ipAddress?

> `optional` __ipAddress?__: `string`

Defined in: src/managers/AuthManager.ts:1094

***

### purpose?

> `optional` __purpose?__: `"sign-in"` \| `"re-check"`

Defined in: src/managers/AuthManager.ts:1096

***

### userAgent?

> `optional` __userAgent?__: `string`

Defined in: src/managers/AuthManager.ts:1095
