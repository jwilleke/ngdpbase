[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FileOidcAdapter](../README.md) / FileOidcAdapterStore

# Class: FileOidcAdapterStore

Defined in: src/providers/FileOidcAdapter.ts:36

## Constructors

### Constructor

> __new FileOidcAdapterStore__(`dir`, `now?`): `FileOidcAdapterStore`

Defined in: src/providers/FileOidcAdapter.ts:40

#### Parameters

##### dir

`string`

##### now?

() => `number`

#### Returns

`FileOidcAdapterStore`

## Methods

### adapter()

> __adapter__(`name`): `Adapter`

Defined in: src/providers/FileOidcAdapter.ts:55

#### Parameters

##### name

`string`

#### Returns

`Adapter`

***

### adapterFactory()

> __adapterFactory__(): (`name`) => `Adapter`

Defined in: src/providers/FileOidcAdapter.ts:51

The factory node-oidc-provider calls once per model.

#### Returns

(`name`) => `Adapter`

***

### destroyWhere()

> __destroyWhere__(`name`, `match`): `Promise`\<`number`\>

Defined in: src/providers/FileOidcAdapter.ts:99

Delete every row of one model whose payload matches; returns how many went. For sign-out (#1572).

#### Parameters

##### name

`string`

##### match

(`payload`) => `boolean`

#### Returns

`Promise`\<`number`\>

***

### flush()

> __flush__(): `Promise`\<`void`\>

Defined in: src/providers/FileOidcAdapter.ts:113

Wait for every pending write; used at shutdown.

#### Returns

`Promise`\<`void`\>

***

### listLive()

> __listLive__(`name`): `Promise`\<`AdapterPayload`[]\>

Defined in: src/providers/FileOidcAdapter.ts:93

Live rows of one model whose payload matches, for the manager's own sweeps (sign-out, grants).

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`AdapterPayload`[]\>

***

### prepare()

> __prepare__(): `string` \| `null`

Defined in: src/providers/FileOidcAdapter.ts:46

Make the directory owner-only. Returns a warning when the filesystem ignores modes.

#### Returns

`string` \| `null`
