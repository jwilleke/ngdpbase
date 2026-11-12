[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/User](../README.md) / SENSITIVE\_USER\_FIELDS

# Variable: SENSITIVE\_USER\_FIELDS

> `const` __SENSITIVE\_USER\_FIELDS__: readonly \[`"password"`, `"roles"`, `"isActive"`, `"isExternal"`, `"isTest"`, `"email"`, `"profileLocked"`, `"username"`\]

Defined in: src/types/User.ts:79

The account fields whose change is recorded on `user-edit` with the field name
only, and that a policy condition may never read as `account:` or `profile:`
(#2261): the password, the email, the roles and the like.
