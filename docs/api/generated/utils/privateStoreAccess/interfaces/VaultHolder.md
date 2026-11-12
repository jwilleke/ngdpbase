[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreAccess](../README.md) / VaultHolder

# Interface: VaultHolder

Defined in: src/utils/privateStoreAccess.ts:49

The PDP surface [holdsInVault](../functions/holdsInVault.md) needs.

## Extends

- `AdminVaultEntry`

## Methods

### adminMayEnterVault()?

> `optional` __adminMayEnterVault__(`ctx`, `owner`, `vault`, `resource`, `record?`): `Promise`\<`boolean`\>

Defined in: src/utils/privateStoreAccess.ts:37

#### Parameters

##### ctx

`unknown`

##### owner

`string`

##### vault

`string`

##### resource

`string`

##### record?

`boolean`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

`AdminVaultEntry.adminMayEnterVault`

***

### holds()

> __holds__(`subject`, `action`, `on`): `Promise`\<`boolean`\>

Defined in: src/utils/privateStoreAccess.ts:50

#### Parameters

##### subject

`unknown`

##### action

`string`

##### on

###### attributes

`Record`\<`string`, `unknown`\>

###### resource

\{ `id`: `string`; `type`: `string`; \}

###### resource.id

`string`

###### resource.type

`string`

#### Returns

`Promise`\<`boolean`\>
