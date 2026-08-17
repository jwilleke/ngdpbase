[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/services/InstallService](../README.md) / default

# Class: default

Defined in: [src/services/InstallService.ts:121](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/services/InstallService.ts#L121)

InstallService - Handles first-run installation and configuration

Manages the initial setup process including:

- Writing app-custom-config.json with user-provided settings
- Creating users/organizations.json with Schema.org organization data
- Copying startup pages from required-pages/ to pages/
- Creating the initial admin user

 InstallService

## Constructors

### Constructor

> __new default__(`engine`): `InstallService`

Defined in: [src/services/InstallService.ts:131](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/services/InstallService.ts#L131)

Creates a new InstallService instance

#### Parameters

##### engine

`WikiEngine`

The wiki engine instance

#### Returns

`InstallService`

## Methods

### createPagesFolder()

> __createPagesFolder__(): `Promise`\<`PagesFolderResult`\>

Defined in: [src/services/InstallService.ts:238](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/services/InstallService.ts#L238)

Create pages folder and copy required pages

Copies pages from required-pages directory to the pages directory

#### Returns

`Promise`\<`PagesFolderResult`\>

Result with success status and number of pages copied

#### Async

***

### detectMissingPagesOnly()

> __detectMissingPagesOnly__(): `Promise`\<`MissingPagesResult`\>

Defined in: [src/services/InstallService.ts:203](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/services/InstallService.ts#L203)

Detect if only pages folder is missing

Returns true if installation is otherwise complete but pages folder is missing/empty

#### Returns

`Promise`\<`MissingPagesResult`\>

Result with missingPagesOnly flag and details

***

### detectPartialInstallation()

> __detectPartialInstallation__(): `Promise`\<`PartialInstallationState`\>

Defined in: [src/services/InstallService.ts:164](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/services/InstallService.ts#L164)

Detect partial installation state

#### Returns

`Promise`\<`PartialInstallationState`\>

Partial installation status

***

### generateSessionSecret()

> __generateSessionSecret__(): `string`

Defined in: [src/services/InstallService.ts:766](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/services/InstallService.ts#L766)

Generate a random session secret

#### Returns

`string`

Random hex string

***

### isInstallRequired()

> __isInstallRequired__(): `Promise`\<`boolean`\>

Defined in: [src/services/InstallService.ts:141](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/services/InstallService.ts#L141)

Check if installation is required

#### Returns

`Promise`\<`boolean`\>

True if install is needed

***

### processInstallation()

> __processInstallation__(`installData`): `Promise`\<`InstallationResult`\>

Defined in: [src/services/InstallService.ts:323](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/services/InstallService.ts#L323)

Process installation with provided data

Supports retrying partial installations. If some steps are already complete,
skips them and continues with remaining steps. This allows users to recover
from partial installation states without needing to reset.

#### Parameters

##### installData

`InstallData`

Installation form data

#### Returns

`Promise`\<`InstallationResult`\>

Result with success status, completed steps, and any errors

#### Async

***

### resetInstallation()

> __resetInstallation__(): `Promise`\<`ResetResult`\>

Defined in: [src/services/InstallService.ts:409](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/services/InstallService.ts#L409)

Reset partial installation to allow retry

#### Returns

`Promise`\<`ResetResult`\>

Result with success status

#### Async
