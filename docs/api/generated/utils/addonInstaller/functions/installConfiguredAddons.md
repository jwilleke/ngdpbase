[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonInstaller](../README.md) / installConfiguredAddons

# Function: installConfiguredAddons()

> __installConfiguredAddons__(`specs`, `opts`): `Promise`\<[`InstallOutcome`](../interfaces/InstallOutcome.md)[]\>

Defined in: src/utils/addonInstaller.ts:441

Install or verify every add-on in `specs` (`ngdpbase.addons.install`).
Never throws for one add-on's problem: each outcome says what happened.

## Parameters

### specs

`Record`\<`string`, `unknown`\>

### opts

[`InstallerOptions`](../interfaces/InstallerOptions.md)

## Returns

`Promise`\<[`InstallOutcome`](../interfaces/InstallOutcome.md)[]\>
