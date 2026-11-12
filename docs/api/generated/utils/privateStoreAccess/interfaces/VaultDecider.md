[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreAccess](../README.md) / VaultDecider

# Interface: VaultDecider

Defined in: src/utils/privateStoreAccess.ts:41

The PDP surface a vault decision needs.

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

### decide()

> __decide__(`subject`, `request`): `Promise`\<\{ `conditionNotMet?`: `string`[]; `permit`: `boolean`; `policyIds?`: `string`[]; \}\>

Defined in: src/utils/privateStoreAccess.ts:42

#### Parameters

##### subject

`unknown`

##### request

###### action

`string`

###### attributes

`Record`\<`string`, `unknown`\>

###### resource

\{ `id`: `string`; `type`: `string`; \}

###### resource.id

`string`

###### resource.type

`string`

#### Returns

`Promise`\<\{ `conditionNotMet?`: `string`[]; `permit`: `boolean`; `policyIds?`: `string`[]; \}\>
