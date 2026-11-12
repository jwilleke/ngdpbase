[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonInstaller](../README.md) / rollBackUpdate

# Function: rollBackUpdate()

> __rollBackUpdate__(`addonsDir`, `slug`, `now?`): `Promise`\<\{ `from`: `string`; `to`: `string`; \} \| `undefined`\>

Defined in: src/utils/addonInstaller.ts:582

The switched-to release did not load: restore the previous release on disk
and in the lock, so the next start runs it. The new folder is set aside
(`.rejected-…`) for inspection. Undefined when there is nothing to undo.

## Parameters

### addonsDir

`string`

### slug

`string`

### now?

`Date` = `...`

## Returns

`Promise`\<\{ `from`: `string`; `to`: `string`; \} \| `undefined`\>
