[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / parsePrivatestore

# Function: parsePrivatestore()

> __parsePrivatestore__(`value`): \{ `root`: `string`; `vaultId`: `string`; \} \| `null`

Defined in: src/utils/privateStorePath.ts:149

A system-category's vault, read from its `storageLocation.privatestore`
(#1504): `pages/vaults/{user}/journal/` → `{ root: 'vaults', vaultId: 'journal' }`.
The shape is fixed — `pages/`, the vaults' parent folder, the `{user}`
placeholder, the vault id — and `null` for anything else, so a malformed
entry never names a folder.

## Parameters

### value

`unknown`

## Returns

\{ `root`: `string`; `vaultId`: `string`; \} \| `null`
