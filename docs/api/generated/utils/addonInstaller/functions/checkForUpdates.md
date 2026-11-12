[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonInstaller](../README.md) / checkForUpdates

# Function: checkForUpdates()

> __checkForUpdates__(`specs`, `opts`): `Promise`\<[`UpdateCheck`](../interfaces/UpdateCheck.md)[]\>

Defined in: src/utils/addonInstaller.ts:618

Ask the registry, for every installed add-on, which releases in its range
are newer than the one pinned. Reads the packument only; writes nothing.
Called only when an administrator opens the add-ons page or presses Check,
never at start.

## Parameters

### specs

`Record`\<`string`, `unknown`\>

### opts

[`InstallerOptions`](../interfaces/InstallerOptions.md)

## Returns

`Promise`\<[`UpdateCheck`](../interfaces/UpdateCheck.md)[]\>
