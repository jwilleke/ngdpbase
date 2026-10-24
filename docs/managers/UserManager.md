---
name: UserManager
description: "User CRUD, sessions, authentication, profile-page binding, contact-recipient resolution"
dateModified: '2026-10-24'
category: managers
code: src/managers/UserManager.ts
---

# UserManager

__Module:__ `src/managers/UserManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [UserManager-Complete-Guide.md](UserManager-Complete-Guide.md)

---

## Overview

UserManager handles user authentication, authorization, role management, and session management. It provides a centralized system for managing user accounts with policy-based permissions through integration with PolicyManager.

## Key Features

- __Policy-Based Permissions__ - Permissions via PolicyManager, not hardcoded
- __Role-Based Access Control__ - Roles defined in configuration
- __Session Management__ - File-based sessions with expiration
- __External Authentication__ - OAuth/JWT support for external users
- __Schema.org Integration__ - Auto-syncs users to Person data
- __User Pages__ - Automatic user page creation

## Quick Example

```javascript
const userManager = engine.getManager('UserManager');

// Authenticate
const user = await userManager.authenticateUser('admin', 'password');

// Access decisions are the PDP's, asked through a context (#1431):
// await ctx.hasPermission('page-edit')

// Create user
const newUser = await userManager.createUser({
  username: 'john',
  email: 'john@example.com',
  password: 'secure123',
  roles: ['editor']
});

// Create session
const sessionId = await userManager.createSession('john');
```

## Authentication Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `authenticateUser(username, password)` | `User\|null` | Authenticate credentials |
| `createSession(username, data)` | `string` | Create session, return ID |
| `getSession(sessionId)` | `Object\|null` | Get session data |
| `deleteSession(sessionId)` | `void` | Delete session |
| `deleteUserSessions(username, reason, from?)` | `number` | End every live session of the account in the session store (`account-deleted` / `account-disabled`, through `endSession`), destroy each, return how many (#1937) |
| `endStaleSessions()` | `number` | At startup: end and destroy every stored session that no longer belongs to its account (`checkSessionAccount`, #1937) |

## Authorization Methods

None. A door asks its context (`ctx.hasPermission`, `ctx.canAccess`); the decision is the [PolicyDecisionPoint](../../src/security/PolicyDecisionPoint.ts)'s (`permits`, `getUserPermissions`, `userHoldsPermission`) — [#1431](https://github.com/jwilleke/ngdpbase/issues/1431) step 14.

## User Management Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `createUser(userData)` | `User` | Create new user |
| `updateUser(username, updates, ctx)` | `Omit<User, 'password'>` | Change an account. `updates` is the fields to merge, or a function `(current) => updates` (below). Returns the account as written, never the password hash: the hash leaves UserManager only through `storedPasswordHash`, for the password check |
| `deleteUser(username)` | `void` | Delete user |
| `getUser(username)` | `User\|null` | Get user by username |
| `getAllUsers()` | `User[]` | Get all users |

### One change at a time per account

Every read-merge-write of an account runs inside one `KeyedSerial` (`src/utils/keyedSerial.ts`) held by UserManager, keyed by the normalized username (trimmed, lower case), from the read to the write ([#2025](https://github.com/jwilleke/ngdpbase/issues/2025), applying the managers guide's [#2015](https://github.com/jwilleke/ngdpbase/issues/2015) rule). Changes to one user run one after another, each reading what the last one wrote; changes to different users run side by side. What runs under the key:

- `updateUser`, in both forms: the read, the checks, the role change and the write.
- `recordSignIn` (last sign-in, sign-in count) and `upgradePasswordHash` (the hash raised at sign-in).
- `resetPasswordWithRecoveryWords`: the read, the key rewrap and the password write.
- `createUser`'s second write, which records the user's profile page.

What comes after the write runs outside the key, because it reaches other managers: turning a disabled account's access off (`AuthManager.closeAccess`), keeping the user's identity record in step (`PersonManager`), and the `user-edit` audit record.

__The function form.__ When the change depends on what the account holds now (append to a list, flip a preference), pass a function instead of the fields:

```typescript
await userManager.updateUser(username, (current) => {
  const ownership = Array.isArray(current.ownership) ? current.ownership : [];
  if (ownership.some((o) => o.place === place)) return undefined; // nothing to change
  return { ownership: [...ownership, { place, since }] };
}, ctx);
```

- It runs inside the account's key, between the read and the write, and may be `async`.
- It is handed a copy of the account without the password hash (an add-on's own fields included). Changing the copy changes nothing; only what it returns is merged.
- It returns the fields to merge, as the object form takes them, or `undefined` to change nothing: then nothing is written, recorded or kept in step, and `updateUser` returns the account as it is.
- Everything else is as for the object form: the checks (a password on an external account, an email another account has), the role change, all or nothing ([#2015](https://github.com/jwilleke/ngdpbase/issues/2015)), and the `user-edit` record of the sensitive fields it returns.
- It must not call `updateUser` for the same user, or anything that does: the key is not re-entrant, so the inner call would wait for the outer one forever. A function that throws writes nothing, and `updateUser` throws its error.

Core's own preference saves use it: `POST /preferences`, the theme toggle, My Links (add, remove, reorder), an add-on's per-person switch (`AddonsManager`) and the journal's settings.

## Role Methods

None. The role catalogue is read with `ConfigurationManager.getProperty('ngdpbase.roles.definitions', {})` (step 11), and who holds which role is [RoleManager](RoleManager.md)'s — `resolveUserRoles`, `hasRole`, `assignRole`, `removeRole` (step 12) — per [#1431](https://github.com/jwilleke/ngdpbase/issues/1431).

## Built-in Roles

| Role | Added For | Purpose |
| ------ | ----------- | --------- |
| `All` | Everyone | Universal role (including anonymous) |
| `Authenticated` | Logged-in users | Any authenticated user |
| `Anonymous` | No session | Public access |

## Configuration

```json
{
  "ngdpbase.user.enabled": true,
  "ngdpbase.user.provider": "jsonuserprovider",
  "ngdpbase.user.provider.storagedir": "./users",
  "ngdpbase.user.security.passwordsalt": "ngdpbase-salt",
  "ngdpbase.user.security.sessionexpiration": 86400000,
  "ngdpbase.user.account-roles": { "vault-owner": true },
  "ngdpbase.roles.definitions": {
    "admin": { "name": "admin", "displayname": "Administrator" },
    "editor": { "name": "editor", "displayname": "Editor" }
  }
}
```

`ngdpbase.user.account-roles` names the roles every account holds ([#1539](https://github.com/jwilleke/ngdpbase/issues/1539)). `createUser` adds them to whatever roles the sign-up path or the admin chose, and so does the bootstrap admin's creation. Accounts made before a role was listed get it once, at boot, through `RoleManager.grantToEveryAccountOnce`. It ships as `{ "vault-owner": true }`: the role every user holds, used for "every user" grants (own profile, own vaults, an add-on's own-records permission; see the [add-ons guide](../guides/addons-developer-guide.md#permissions)).

## User record

Defined by the `User` interface in `src/types/User.ts`, which is the authoritative list.

```javascript
{
  username: "john",
  email: "john@example.com",
  displayName: "John Doe",
  password: "<sha256 hash>",   // empty string for external accounts
  isActive: true,
  isSystem: false,
  isExternal: false,
  isTest: false,
  profileLocked: undefined,
  profilePage: "John Doe",
  createdAt: "2025-10-11T12:00:00.000Z",
  lastLogin: "2025-10-11T14:30:00.000Z",
  loginCount: 15,
  preferences: { locale: "en-US", timezone: "UTC" }
}
```

__Roles are not on the record.__ `User.roles[]` is deprecated as of #617 iteration 3b — membership is owned by `RoleManager` as `OrganizationRole` records. Read a user's roles with `RoleManager.resolveUserRoles(ctx, username)` ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)); never from this object.

### Account flags

The five booleans each answer a different question, and they are deliberately independent — none implies another.

| Flag | Meaning | Set by | Enforced at |
|---|---|---|---|
| `isActive` | Account may sign in at all | Admin, or `createUser` | Authentication |
| `isSystem` | Account cannot be deleted | `createDefaultAdmin` (`admin`) | `deleteUser` |
| `isExternal` | Identity owned by an external provider (OAuth, magic-link auto-provision) | The auth provider | Password paths — an external account has an empty hash and can never match a password |
| `profileLocked` | Password, email and display name are frozen against self-service change (#1029) | `createUser`, for shared accounts | `POST /profile` |
| `isTest` | Test account: holds test or synthetic data, never real data ([#1805](https://github.com/jwilleke/ngdpbase/issues/1805)) | Admin, on create or edit (`user-create` / `user-edit`) | Nowhere in core — marked in the admin list, a banner for the user, and handed to the host |

Two pairings are worth stating explicitly, because both look interchangeable and are not:

- __`isSystem` is not "protected".__ It means one thing: `deleteUser` refuses. It is set on `admin`, an account that must keep self-service password change — so it can never grow to imply immutability.
- __`profileLocked` is not `isExternal`.__ An external account has no password to change; a locked account has one, published deliberately, that must not change. `profileLocked` also covers email, which is the field that matters most: magic-link login resolves an account by address, so an unlocked shared account can be taken over by repointing its email regardless of the password.

- __`isTest` is an attribute, not a role.__ It grants nothing and no policy reads it. A role could be given to a real account and mix the data again; the flag says what the account's data *is*. Core only marks and shows it: "Test account" in `/admin/users`, a persistent banner for the signed-in user (`header.ejs`), `isTest` on the request's subject, so on `req.userContext`, `WikiContext.userContext`, the ParseContext a plugin is handed, `currentUser` in `engine.templateData`, and `ApiContext.isTest` for an add-on route; and the OIDC `test_account` claim. A host or add-on enforces its own rules from those. Every read through `UserManager` (`getUser`, `getUsers`, `getUserByEmail`, `searchUsers`, `createUser`) returns it as a boolean; an account saved before the flag has none and reads as `false`. Setting or clearing it is a `user-edit` audit row with `fields` naming `isTest` and `metadata.isTest = { from, to }` when the value changes; `user-create` carries `isTest`. `POST /profile` never accepts it, so only an administrator can change it. One thing core does with it ([#2008](https://github.com/jwilleke/ngdpbase/issues/2008)): `createUserPage` stamps a test account's profile page with the `test-artifact` system keyword, and `deleteUser` deletes it with the account through `PageManager.deleteTestArtifacts(ctx, { author, systemCategory: 'user-profile' })`, which reaches only pages carrying the keyword. An ordinary account's profile page is kept when the account is deleted. The stamp is made at creation only: setting the flag on an existing account does not stamp its profile.

Neither flag restricts administrators. `/admin/users/<name>/edit` requires `user-edit` and consults neither, so a locked or system account is always recoverable.

## Related Managers

- [PolicyManager](PolicyManager.md) - Policy definitions
- [PolicyEvaluator](PolicyEvaluator.md) - Permission evaluation
- [SchemaManager](SchemaManager.md) - Schema.org Person sync
- [PageManager](PageManager.md) - User page creation

## Developer Documentation

For complete API reference, authentication flows, and troubleshooting:

- [UserManager-Complete-Guide.md](UserManager-Complete-Guide.md)
