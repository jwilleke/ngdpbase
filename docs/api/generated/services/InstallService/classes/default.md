[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [services/InstallService](../README.md) / default

# Class: default

Defined in: src/services/InstallService.ts:137

InstallService - Handles first-run installation and configuration

Manages the initial setup process including:

- Writing app-custom-config.json with user-provided settings
- Creating users/organizations.json with Schema.org organization data
- Creating the initial admin user
- Creating .install-complete marker file in INSTANCE_DATA_FOLDER

Installation state is tracked via INSTANCE_DATA_FOLDER/.install-complete file,
NOT via config property. This ensures each instance (e.g., Docker container)
starts fresh and runs through installation on first access.

 InstallService

## Constructors

### Constructor

> __new default__(`engine`): `InstallService`

Defined in: src/services/InstallService.ts:147

Creates a new InstallService instance

#### Parameters

##### engine

`WikiEngine`

The wiki engine instance

#### Returns

`InstallService`

## Methods

### detectPartialInstallation()

> __detectPartialInstallation__(): `Promise`\<[`PartialInstallationState`](../interfaces/PartialInstallationState.md)\>

Defined in: src/services/InstallService.ts:218

Detect partial installation state

#### Returns

`Promise`\<[`PartialInstallationState`](../interfaces/PartialInstallationState.md)\>

Partial installation status

***

### generateSessionSecret()

> __generateSessionSecret__(): `string`

Defined in: src/services/InstallService.ts:713

Generate a random session secret

#### Returns

`string`

Random hex string

***

### isInstallComplete()

> __isInstallComplete__(): `Promise`\<`boolean`\>

Defined in: src/services/InstallService.ts:158

Check if installation has been completed
Checks for .install-complete file in INSTANCE_DATA_FOLDER

#### Returns

`Promise`\<`boolean`\>

True if installation is complete

***

### isInstallRequired()

> __isInstallRequired__(): `Promise`\<`boolean`\>

Defined in: src/services/InstallService.ts:173

Check if installation is required: the marker is missing (#1410).

The bootstrap admin and the seeded shipped pages exist from the first
start, so they say nothing about whether the operator ran setup. A site
that predates the marker is given one at start-up by
[markExistingSiteInstalled](#markexistingsiteinstalled).

#### Returns

`Promise`\<`boolean`\>

True if install is needed

***

### markExistingSiteInstalled()

> __markExistingSiteInstalled__(): `Promise`\<`boolean`\>

Defined in: src/services/InstallService.ts:186

Write the marker for a site that was set up before the marker decided
install state (#1410): no marker, the base URL is configured (the start-up
check #642 needs it once the marker exists), and the site has its own
custom config or a page it did not ship with. A fresh site has neither and
gets the wizard. Runs once at start-up; logs what it inferred.

#### Returns

`Promise`\<`boolean`\>

True if the marker was written

***

### markHeadlessInstallationComplete()

> __markHeadlessInstallationComplete__(): `Promise`\<`void`\>

Defined in: src/services/InstallService.ts:526

Mark headless installation as complete
Creates .install-complete file in INSTANCE_DATA_FOLDER with headless flag

#### Returns

`Promise`\<`void`\>

#### Async

***

### processHeadlessInstallation()

> __processHeadlessInstallation__(): `Promise`\<`HeadlessInstallResult`\>

Defined in: src/services/InstallService.ts:474

Process headless installation for Docker/K8s automated deployments

When HEADLESS_INSTALL=true environment variable is set:

- Copies required pages to data/pages/ if empty
- Seeds the install's anchor Organization from
  `ngdpbase.application.organization.*` config (#617) when one is named
  — required so the startup invariant in OrganizationManager.initialize()
  doesn't fail on next boot
- Creates .install-complete marker
- Skips wizard entirely

Note: WikiEngine creates the `admin` account automatically. A headless
install refuses to start unless an admin password has actually been
configured — either by exporting NGDPBASE_ADMIN_PASSWORD and pointing
`ngdpbase.user.security.defaultpassword` at it, or by setting that key
directly in app-custom-config.json.

That refusal is enforced in `assertHeadlessBootstrapPassword`
(src/utils/headlessAdminPassword.ts), called from
`UserManager.createDefaultAdmin()`. Until #1087 this comment claimed the
behaviour without the code implementing it: the config key ships as the
literal `admin123`, so a headless deploy with nothing configured came up on
a credential published in this repository — failing open where this said it
failed closed.

Interactive installs are deliberately unaffected: a fresh local install
comes up on the shipped password so the setup wizard is reachable, with a
startup banner warning until it is changed. An unattended deploy has nobody
to read that banner, which is why only the headless path refuses.

Custom config: the operator must provide
`INSTANCE_DATA_FOLDER/config/app-custom-config.json` (e.g., via a Docker
volume mount or k8s ConfigMap) before the headless boot, OR rely on env-var
overrides such as `NGDPBASE_BASE_URL` (#642). The headless flow no longer
seeds a template config — there is no `*.example` file to copy.

#### Returns

`Promise`\<`HeadlessInstallResult`\>

Result with success status and details of steps performed

#### Async

***

### processInstallation()

> __processInstallation__(`installData`): `Promise`\<`InstallationResult`\>

Defined in: src/services/InstallService.ts:240

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

Defined in: src/services/InstallService.ts:311

Reset partial installation to allow retry

#### Returns

`Promise`\<`ResetResult`\>

Result with success status

#### Async
