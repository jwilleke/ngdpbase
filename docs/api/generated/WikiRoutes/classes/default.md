[__ngdpbase API v1.5.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [WikiRoutes](../README.md) / default

# Class: default

Defined in: [src/routes/WikiRoutes.ts:118](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L118)

## Constructors

### Constructor

> __new default__(`engine`): `WikiRoutes`

Defined in: [src/routes/WikiRoutes.ts:121](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L121)

#### Parameters

##### engine

`WikiEngine`

#### Returns

`WikiRoutes`

## Methods

### adminAuditExport()

> __adminAuditExport__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4853](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4853)

Export audit logs

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAuditLogDetails()

> __adminAuditLogDetails__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4820](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4820)

API endpoint for individual audit log details

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAuditLogs()

> __adminAuditLogs__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4735](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4735)

Admin audit logs page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAuditLogsApi()

> __adminAuditLogsApi__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4772](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4772)

API endpoint for audit logs data

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminBackup()

> __adminBackup__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3417](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3417)

Admin backup - Create and download full system backup

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminCacheStats()

> __adminCacheStats__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4625](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4625)

Admin cache statistics API endpoint

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminClearAllNotifications()

> __adminClearAllNotifications__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4540](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4540)

Clear all notifications (admin only)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminClearCache()

> __adminClearCache__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4653](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4653)

Admin clear all cache API endpoint

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminClearCacheRegion()

> __adminClearCacheRegion__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4688](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4688)

Admin clear cache region API endpoint

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminConfiguration()

> __adminConfiguration__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3475](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3475)

Admin configuration management page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminCreateOrganization()

> __adminCreateOrganization__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4008](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4008)

Create New Organization

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminCreatePolicy()

> __adminCreatePolicy__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:2927](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2927)

Create a new policy

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminCreateRole()

> __adminCreateRole__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3318](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3318)

Create new role (admin only)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminCreateUser()

> __adminCreateUser__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3128](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3128)

Create new user (admin)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminDashboard()

> __adminDashboard__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:2692](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2692)

Admin dashboard

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminDeleteOrganization()

> __adminDeleteOrganization__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4084](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4084)

Delete Organization

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminDeletePolicy()

> __adminDeletePolicy__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3047](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3047)

Delete a policy

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminDeleteRole()

> __adminDeleteRole__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3373](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3373)

Delete role (admin only)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminDeleteUser()

> __adminDeleteUser__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3203](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3203)

Delete user (admin)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminDismissNotification()

> __adminDismissNotification__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4504](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4504)

Dismiss a notification (admin only)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminFixFiles()

> __adminFixFiles__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4181](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4181)

Admin API route to fix all non-compliant files

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminGetOrganization()

> __adminGetOrganization__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4119](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4119)

Get Single Organization (API endpoint)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminGetOrganizationSchema()

> __adminGetOrganizationSchema__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4214](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4214)

Get Organization Schema.org JSON-LD (API endpoint)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminGetPersonSchema()

> __adminGetPersonSchema__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4248](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4248)

Get Schema.org Person schema for a user

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminGetPolicy()

> __adminGetPolicy__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:2968](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2968)

Get a specific policy

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminLogs()

> __adminLogs__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3856](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3856)

Admin logs page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminNotifications()

> __adminNotifications__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4569](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4569)

Notification management page (admin only)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminOrganizations()

> __adminOrganizations__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3946](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3946)

Admin Organizations Management Page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminPolicies()

> __adminPolicies__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:2876](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2876)

Admin policy management dashboard

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminReindex()

> __adminReindex__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3795](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3795)

Admin reindex - Refresh page cache and rebuild search index

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminResetConfiguration()

> __adminResetConfiguration__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3558](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3558)

Reset configuration to defaults

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminRestart()

> __adminRestart__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3744](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3744)

Restart the system (PM2)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminRoles()

> __adminRoles__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3234](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3234)

Admin roles management

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminSettings()

> __adminSettings__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3698](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3698)

Admin settings page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminTestVariables()

> __adminTestVariables__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3644](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3644)

Test variable expansion

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminToggleMaintenance()

> __adminToggleMaintenance__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:2792](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2792)

Toggle maintenance mode (admin only)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminUpdateConfiguration()

> __adminUpdateConfiguration__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3519](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3519)

Update configuration property

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminUpdateOrganization()

> __adminUpdateOrganization__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4045](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4045)

Update Existing Organization

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminUpdatePolicy()

> __adminUpdatePolicy__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3006](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3006)

Update an existing policy

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminUpdateRole()

> __adminUpdateRole__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3274](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3274)

Update role permissions (admin only)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminUpdateUser()

> __adminUpdateUser__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3168](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3168)

Update user (admin)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminUsers()

> __adminUsers__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3088](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3088)

Admin users management

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminValidateFiles()

> __adminValidateFiles__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4144](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4144)

Admin route to validate all files and check for naming convention compliance

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminVariables()

> __adminVariables__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3584](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3584)

Admin variable management page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### comparePageVersions()

> __comparePageVersions__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:5298](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L5298)

GET /api/page/:identifier/compare/:v1/:v2
Compare two versions of a page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### createPage()

> __createPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:972](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L972)

Display create new page form with template selection

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### createPageFromTemplate()

> __createPageFromTemplate__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:1111](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L1111)

Create a new page from template

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### createWikiContext()

> __createWikiContext__(`req`, `options`): [`default`](../../src/context/WikiContext/classes/default.md)

Defined in: [src/routes/WikiRoutes.ts:132](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L132)

Create a WikiContext for the given request and page
This should be the single source of truth for all context information

#### Parameters

##### req

`Request`

Express request object

##### options

`WikiContextOptions` = `{}`

Additional context options (pageName, content, context type)

#### Returns

[`default`](../../src/context/WikiContext/classes/default.md)

WikiContext instance

***

### createWikiPage()

> __createWikiPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:1403](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L1403)

Create a new wiki page via POST /wiki/:page

#### Parameters

##### req

`Request`

Express request object

##### res

`Response`

Express response object

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### deleteAttachment()

> __deleteAttachment__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:2104](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2104)

Delete attachment

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### deleteExport()

> __deleteExport__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:2246](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2246)

Delete export file

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### deletePage()

> __deletePage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:1698](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L1698)

Delete a page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### downloadExport()

> __downloadExport__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:2225](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2225)

Download export file

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### editPage()

> __editPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:1255](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L1255)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### editPageIndex()

> __editPageIndex__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:1064](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L1064)

Handle /edit route without page parameter

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### exportPage()

> __exportPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:2148](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2148)

Export page selection form

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### exportPageHtml()

> __exportPageHtml__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:2168](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2168)

Export page to HTML

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### exportPageMarkdown()

> __exportPageMarkdown__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:2186](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2186)

Export page to Markdown

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### formatLeftMenuContent()

> __formatLeftMenuContent__(`content`): `string`

Defined in: [src/routes/WikiRoutes.ts:798](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L798)

Format left menu content for Bootstrap navigation

#### Parameters

##### content

`string`

#### Returns

`string`

***

### generatePageSchema()

> __generatePageSchema__(`pageData`, `req`): `string`

Defined in: [src/routes/WikiRoutes.ts:608](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L608)

Generate Schema.org JSON-LD markup for a page

#### Parameters

##### pageData

`Record`\<`string`, `unknown`\>

Page metadata and content

##### req

`Request`

Express request object for URL generation

#### Returns

`string`

HTML script tag with JSON-LD

***

### generateSiteSchema()

> __generateSiteSchema__(`req`): `Promise`\<`string`\>

Defined in: [src/routes/WikiRoutes.ts:635](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L635)

Generate site-wide Schema.org markup (Organization, SoftwareApplication)

#### Parameters

##### req

`Request`

Express request object

#### Returns

`Promise`\<`string`\>

HTML script tags with JSON-LD

***

### getActiveSesssionCount()

> __getActiveSesssionCount__(`req`, `res`): `void`

Defined in: [src/routes/WikiRoutes.ts:352](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L352)

Session count (uses app.js sessionStore)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`void`

***

### getAllCategories()

> __getAllCategories__(): `Promise`\<`any`[]\>

Defined in: [src/routes/WikiRoutes.ts:462](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L462)

Get all categories including admin-only categories

#### Returns

`Promise`\<`any`[]\>

***

### getCategories()

> __getCategories__(): `Promise`\<`any`[]\>

Defined in: [src/routes/WikiRoutes.ts:426](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L426)

Extract categories from System Categories page

#### Returns

`Promise`\<`any`[]\>

***

### getCommonTemplateData()

> __getCommonTemplateData__(`req`): `Promise`\<`any`\>

Defined in: [src/routes/WikiRoutes.ts:218](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L218)

Get common template data that all pages need.
This is now the single source of truth for common data.

#### Parameters

##### req

`Request`

Express request object.

#### Returns

`Promise`\<`any`\>

***

### getLeftMenu()

> __getLeftMenu__(`userContext`): `Promise`\<`string` \| `null`\>

Defined in: [src/routes/WikiRoutes.ts:767](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L767)

Get and format left menu content from LeftMenu page

#### Parameters

##### userContext

`UserContext` | `null`

#### Returns

`Promise`\<`string` \| `null`\>

***

### getPageMetadata()

> __getPageMetadata__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:4935](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4935)

Get page metadata in a user-friendly format

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### getPageNames()

> __getPageNames__(`_req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:1915](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L1915)

API endpoint for getting all page names

#### Parameters

##### \_req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### getPageSource()

> __getPageSource__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:3920](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L3920)

Get raw page source (markdown content) for viewing/copying

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### getPageSuggestions()

> __getPageSuggestions__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:5093](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L5093)

API endpoint for page name autocomplete suggestions
GET /api/page-suggestions?q=partial

Used for:

- Autocomplete when typing [page name] in editor
- Autocomplete in search dialogs

Related: GitHub Issue #90 - TypeDown for Internal Page Links

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### getPageVersion()

> __getPageVersion__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:5231](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L5231)

GET /api/page/:identifier/version/:version
Get specific version content

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### getPageVersions()

> __getPageVersions__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:5181](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L5181)

GET /api/page/:identifier/versions
Get version history for a page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### getRequestContext()

> __getRequestContext__(`req`): `object`

Defined in: [src/routes/WikiRoutes.ts:339](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L339)

Extract request context for access control

#### Parameters

##### req

`Request`

Express request object

#### Returns

`object`

Context information

##### ip

> __ip__: `string`

##### referer

> __referer__: `string` \| `undefined`

##### timestamp

> __timestamp__: `string`

##### userAgent

> __userAgent__: `string` \| `undefined`

***

### getRequestInfo()

> __getRequestInfo__(`req`): `RequestInfo`

Defined in: [src/routes/WikiRoutes.ts:196](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L196)

Extract request information for variable expansion

#### Parameters

##### req

`Request`

Express request object

#### Returns

`RequestInfo`

Request information object

***

### getSystemCategories()

> __getSystemCategories__(): `string`[]

Defined in: [src/routes/WikiRoutes.ts:499](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L499)

Get system categories from configuration (admin-only)

#### Returns

`string`[]

***

### getTemplateDataFromContext()

> __getTemplateDataFromContext__(`wikiContext`): `TemplateData`

Defined in: [src/routes/WikiRoutes.ts:149](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L149)

Extract template data from WikiContext
This ensures all templates get consistent data structure

#### Parameters

##### wikiContext

[`default`](../../src/context/WikiContext/classes/default.md)

The wiki context

#### Returns

`TemplateData`

Template data object

***

### getUserKeywords()

> __getUserKeywords__(): `Promise`\<`string`[]\>

Defined in: [src/routes/WikiRoutes.ts:535](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L535)

Extract user keywords from User-Keywords page

#### Returns

`Promise`\<`string`[]\>

***

### homePage()

> __homePage__(`_req`, `res`): `void`

Defined in: [src/routes/WikiRoutes.ts:1930](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L1930)

Home page - show main index

#### Parameters

##### \_req

`Request`

##### res

`Response`

#### Returns

`void`

***

### isRequiredPage()

> __isRequiredPage__(`pageName`): `Promise`\<`boolean`\>

Defined in: [src/routes/WikiRoutes.ts:734](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L734)

Check if a page is a protected page (admin-only edit)

Protected pages include:

- Hardcoded required pages (backward compatibility)
- Pages with system-category: system or documentation

These pages are considered core system pages that may be overwritten
by future updates to the application.

#### Parameters

##### pageName

`string`

The page name to check

#### Returns

`Promise`\<`boolean`\>

True if page requires admin permission to edit

***

### listExports()

> __listExports__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:2205](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2205)

List available exports

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### loginPage()

> __loginPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:2263](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2263)

Login page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### pageDiff()

> __pageDiff__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:5510](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L5510)

GET /diff/:page?v1=X&v2=Y
Show version comparison view

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### pageHistory()

> __pageHistory__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:5433](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L5433)

GET /history/:page
Show page history view

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### parseFileSize()

> __parseFileSize__(`sizeStr`): `number`

Defined in: [src/routes/WikiRoutes.ts:172](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L172)

Parse file size string (e.g., '5MB', '1GB') to bytes

#### Parameters

##### sizeStr

`string`

Size string

#### Returns

`number`

Size in bytes

***

### previewPage()

> __previewPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:1938](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L1938)

API endpoint to get page preview

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### processLogin()

> __processLogin__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:2291](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2291)

Process login

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### processLogout()

> __processLogout__(`req`, `res`): `void`

Defined in: [src/routes/WikiRoutes.ts:2347](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2347)

Process logout

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`void`

***

### processRegister()

> __processRegister__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:2423](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2423)

Process registration

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### profilePage()

> __profilePage__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:2466](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2466)

User profile page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### registerPage()

> __registerPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:2404](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2404)

Registration page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### registerRoutes()

> __registerRoutes__(`app`): `void`

Defined in: [src/routes/WikiRoutes.ts:4283](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L4283)

Register all routes with the Express app

#### Parameters

##### app

`Application`

Express application instance

#### Returns

`void`

***

### renderError()

> __renderError__(`req`, `res`, `status`, `title`, `message`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:703](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L703)

Render error page with consistent template data

#### Parameters

##### req

`Request`

##### res

`Response`

##### status

`number`

##### title

`string`

##### message

`string`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### restorePageVersion()

> __restorePageVersion__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:5357](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L5357)

POST /api/page/:identifier/restore/:version
Restore page to a specific version

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### savePage()

> __savePage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:1550](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L1550)

Save a page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### searchPages()

> __searchPages__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:1792](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L1792)

Search pages with advanced options

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### searchSuggestions()

> __searchSuggestions__(`req`, `res`): `void`

Defined in: [src/routes/WikiRoutes.ts:1898](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L1898)

API endpoint for search suggestions

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`void`

***

### serveAttachment()

> __serveAttachment__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:2072](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2072)

Serve attachment file

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### updatePreferences()

> __updatePreferences__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:2591](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2591)

Update user preferences

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### updateProfile()

> __updateProfile__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:2524](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2524)

Update user profile

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### uploadAttachment()

> __uploadAttachment__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:1984](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L1984)

Upload attachment for a page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### uploadImage()

> __uploadImage__(`req`, `res`): `Response`\<`any`, `Record`\<`string`, `any`\>\>

Defined in: [src/routes/WikiRoutes.ts:2043](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2043)

Upload image file

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Response`\<`any`, `Record`\<`string`, `any`\>\>

***

### userInfo()

> __userInfo__(`req`, `res`): `Promise`\<`void`\>

Defined in: [src/routes/WikiRoutes.ts:2365](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L2365)

User info debug page (shows current user state)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### viewPage()

> __viewPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: [src/routes/WikiRoutes.ts:847](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/WikiRoutes.ts#L847)

Display a wiki page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>
