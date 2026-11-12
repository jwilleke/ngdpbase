[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonInstaller](../README.md) / stageUpdate

# Function: stageUpdate()

> __stageUpdate__(`slug`, `rawSpec`, `version`, `opts`): `Promise`\<[`UpdateOutcome`](../interfaces/UpdateOutcome.md)\>

Defined in: src/utils/addonInstaller.ts:672

Download `version` of an installed add-on and stage it for the next start
(#2100). It must be a release in the configured range, newer than the
pinned one, that this core can run, and it passes the same checks as a
first install (fetchVerified): sha512, provenance, contents,
package.json. `beforeInstall` (the audit record) runs after the checks and
before anything is written. The running add-on's folder is not touched.

## Parameters

### slug

`string`

### rawSpec

`unknown`

### version

`string`

### opts

[`InstallerOptions`](../interfaces/InstallerOptions.md)

## Returns

`Promise`\<[`UpdateOutcome`](../interfaces/UpdateOutcome.md)\>
