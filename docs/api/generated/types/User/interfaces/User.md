[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/User](../README.md) / User

# Interface: User

Defined in: src/types/User.ts:86

User object

Complete user record stored in the user provider.

## Properties

### allowedAuthMethods?

> `optional` __allowedAuthMethods?__: `string`[]

Defined in: src/types/User.ts:197

Allowed authentication methods for this user.
If absent, the user may use any method enabled at the system level.
If present, only the listed provider IDs are accepted (e.g. ["oidc:google", "password"]).
Useful for ensuring admin accounts can always use password as an emergency fallback.

***

### avatar?

> `optional` __avatar?__: `string`

Defined in: src/types/User.ts:183

Profile picture URL or data

***

### createdAt

> __createdAt__: `string`

Defined in: src/types/User.ts:171

Account creation timestamp (ISO 8601)

***

### displayName

> __displayName__: `string`

Defined in: src/types/User.ts:94

Display name (full name)

***

### email

> __email__: `string`

Defined in: src/types/User.ts:91

Email address

***

### isActive

> __isActive__: `boolean`

Defined in: src/types/User.ts:110

Whether user account is active

***

### isExternal

> __isExternal__: `boolean`

Defined in: src/types/User.ts:116

Whether user is external (LDAP, OAuth)

***

### isSystem

> __isSystem__: `boolean`

Defined in: src/types/User.ts:113

Whether user is system user

***

### isTest?

> `optional` __isTest?__: `boolean`

Defined in: src/types/User.ts:132

A test account (#1805): it holds test or synthetic data, never real data,
so a site can keep the two apart by account and show which is which.

An attribute, not a role — it grants nothing and no policy reads it. Set
by an administrator (`user-create` / `user-edit`), marked in the admin
user list, shown to the signed-in person as a banner, and handed to the
host as `userContext.isTest` and the OIDC `test_account` claim, so the
host decides what a test account may do.

Optional in storage only: an account saved before the flag existed has
none. Every read through UserManager returns it as a boolean, `false`
when absent.

***

### lastLogin?

> `optional` __lastLogin?__: `string`

Defined in: src/types/User.ts:174

Last login timestamp (ISO 8601)

***

### loginCount

> __loginCount__: `number`

Defined in: src/types/User.ts:177

Total login count

***

### metadata?

> `optional` __metadata?__: `Record`\<`string`, `unknown`\>

Defined in: src/types/User.ts:189

Additional metadata

***

### password

> __password__: `string`

Defined in: src/types/User.ts:97

Hashed password (SHA-256 or bcrypt)

***

### passwordChangedAt?

> `optional` __passwordChangedAt?__: `string`

Defined in: src/types/User.ts:168

When the password last changed, ISO 8601 (#1592); written only by setPassword().

***

### preferences

> __preferences__: [`UserPreferences`](UserPreferences.md)

Defined in: src/types/User.ts:180

User preferences

***

### profileLocked?

> `optional` __profileLocked?__: `boolean`

Defined in: src/types/User.ts:159

Freeze this account's identity against self-service change (#1029).

For a shared account whose credentials are published — a demo login, say —
letting the holder edit their own identity hands the account away:

- __password__ — the first visitor to change it locks out every other
  visitor and makes the published credential wrong.
- __email__ — worse, and the reason this covers more than the password.
  Magic-link login resolves an account by email address
  (`MagicLinkAuthProvider.getUserByEmail`), so a visitor who repoints the
  address at their own inbox can magic-link back in indefinitely. The
  password lock alone would not have stopped them.
- __displayName__ — defacement on a public instance.

Preferences, avatar and pinned links stay editable: the point is to let a
visitor drive the account, not to freeze it.

Blocks the `/profile` path only. An administrator can still change any of
it through `/admin/users/<name>/edit`, which requires `user-edit`, so the
account is never unrecoverable.

Distinct from `isSystem`, which means "cannot be deleted" and is set on
`admin` — an account that must keep self-service password change.

***

### profilePage?

> `optional` __profilePage?__: `string`

Defined in: src/types/User.ts:186

Wiki page name for this user's profile page

***

### ~~roles?~~

> `optional` __roles?__: `string`[]

Defined in: src/types/User.ts:107

#### Deprecated

since #617 iteration 3b. Role membership is now stored
canonically as OrganizationRole records owned by `RoleManager`; resolve
a user's roles via `RoleManager.resolveUserRoles(ctx, username)`. The field
is retained as optional for backwards compatibility while in-flight
`users.json` files still carry it; the `strip-user-roles.ts` migration
removes it. New code MUST NOT read or write this field directly.

***

### sessionGeneration?

> `optional` __sessionGeneration?__: `number`

Defined in: src/types/User.ts:165

Raised on every password change (#1482). A session stamped with an older
value is signed out on its next request. See `utils/sessionGeneration`.

***

### username

> __username__: `string`

Defined in: src/types/User.ts:88

Username (unique identifier for login)
