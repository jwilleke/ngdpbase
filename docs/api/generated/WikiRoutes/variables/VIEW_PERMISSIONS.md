[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [WikiRoutes](../README.md) / VIEW\_PERMISSIONS

# Variable: VIEW\_PERMISSIONS

> `const` __VIEW\_PERMISSIONS__: readonly \[`"admin-system"`, `"admin-roles"`, `"user-read"`, `"user-edit"`, `"user-create"`, `"page-create"`, `"page-edit"`, `"share-create"`, `"page-raw-edit"`, `"config-manage"`, `"secret-reveal"`, `"account-security"`, `"identity-read"`, `"identity-manage"`, `"executive-read"`, `"page-export"`\]

Defined in: src/routes/WikiRoutes.ts:912

The permissions a view may ask about with `can()` / `lockedUnless()`,
resolved once per render (#1198). A view asking for one not listed here
always reads "not held" — how #1525's config-manage buttons were locked for
an admin. `viewPermissions.test.ts` scans the views and fails on any
permission they use that is missing.
