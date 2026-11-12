[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/SqliteDatabaseProvider](../README.md) / default

# Class: default

Defined in: src/providers/SqliteDatabaseProvider.ts:36

## Extends

- [`default`](../../BaseDatabaseProvider/classes/default.md)\<[`SqliteHandle`](../type-aliases/SqliteHandle.md)\>

## Constructors

### Constructor

> __new default__(`file`, `key`, `ledger`, `ledgerTable?`, `options?`): `SqliteDatabaseProvider`

Defined in: src/providers/SqliteDatabaseProvider.ts:53

#### Parameters

##### file

`string`

the database file; created when absent

##### key

`string`

the SQLCipher key; '' opens the file unencrypted

##### ledger

[`Migration`](../../sqliteMigrations/interfaces/Migration.md)[]

the migrations, strictly ascending by id

##### ledgerTable?

`string` = `'schema_migrations'`

where applied ids are recorded; an add-on's database names its own (#13)

##### options?

###### busyTimeoutMs?

`number`

how long a statement waits for a lock another connection holds
  (`ngdpbase.database.busy-timeout-ms`, #1710) before failing with SQLITE_BUSY

#### Returns

`SqliteDatabaseProvider`

#### Overrides

[`default`](../../BaseDatabaseProvider/classes/default.md).[`constructor`](../../BaseDatabaseProvider/classes/default.md#constructor)

## Properties

### migrations

> `readonly` __migrations__: [`MigrationReport`](../../sqliteMigrations/interfaces/MigrationReport.md)

Defined in: src/providers/SqliteDatabaseProvider.ts:43

What the ledger did at open: the ids applied now, and how many were already there.

***

### providerDescription

> `protected` __providerDescription__: `string` = `'SQLite application database, SQLCipher-encrypted when a key is set'`

Defined in: src/providers/SqliteDatabaseProvider.ts:38

One line on what it does. Optional, as on the canonical type.

#### Overrides

[`default`](../../BaseDatabaseProvider/classes/default.md).[`providerDescription`](../../BaseDatabaseProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseDatabaseProvider/classes/default.md).[`providerFeatures`](../../BaseDatabaseProvider/classes/default.md#providerfeatures)

***

### providerName

> `protected` __providerName__: `string` = `'SqliteDatabaseProvider'`

Defined in: src/providers/SqliteDatabaseProvider.ts:37

What this provider calls itself (#1151).

`protected`, and set by a subclass in its constructor or field
initialisers. A provider that sets nothing reports the class name rather
than a placeholder, so the answer is never a lie — it is either what the
author chose or what the runtime knows.

#### Overrides

[`default`](../../BaseDatabaseProvider/classes/default.md).[`providerName`](../../BaseDatabaseProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseDatabaseProvider/classes/default.md).[`providerVersion`](../../BaseDatabaseProvider/classes/default.md#providerversion)

## Accessors

### handle

#### Get Signature

> __get__ __handle__(): `Database`

Defined in: src/providers/SqliteDatabaseProvider.ts:121

The open, migrated connection, for the providers built over it.

##### Returns

`Database`

#### Overrides

[`default`](../../BaseDatabaseProvider/classes/default.md).[`handle`](../../BaseDatabaseProvider/classes/default.md#handle-1)

## Methods

### close()

> __close__(): `void`

Defined in: src/providers/SqliteDatabaseProvider.ts:147

#### Returns

`void`

#### Overrides

[`default`](../../BaseDatabaseProvider/classes/default.md).[`close`](../../BaseDatabaseProvider/classes/default.md#close)

***

### getDurability()

> __getDurability__(): [`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md)

Defined in: src/providers/SqliteDatabaseProvider.ts:143

What this provider does with a record before it is durably stored.

Null means the provider has not stated it — silence rather than a default.
A provider that buffers and forgets to declare it must not inherit an
assertion that it writes immediately, which is precisely the bug this
contract replaces. A reporting layer renders null as "not stated", never
as "durable".

#### Returns

[`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md)

#### Overrides

[`default`](../../BaseDatabaseProvider/classes/default.md).[`getDurability`](../../BaseDatabaseProvider/classes/default.md#getdurability)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/BaseProvider.ts:93

Identify this provider.

Concrete providers may still override this — their name, version and
feature list are their own data, not duplication. What moved up here is
the SHAPE, so the nine copies of `ProviderInfo` become one, and so a new
provider that sets the fields gets a correct answer without writing the
method at all.

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

#### Inherited from

[`default`](../../BaseDatabaseProvider/classes/default.md).[`getProviderInfo`](../../BaseDatabaseProvider/classes/default.md#getproviderinfo)

***

### integrityOk()

> __integrityOk__(): `boolean`

Defined in: src/providers/SqliteDatabaseProvider.ts:129

#### Returns

`boolean`

#### Overrides

[`default`](../../BaseDatabaseProvider/classes/default.md).[`integrityOk`](../../BaseDatabaseProvider/classes/default.md#integrityok)

***

### migrate()

> __migrate__(`ledger`, `ledgerTable`): [`MigrationReport`](../../sqliteMigrations/interfaces/MigrationReport.md)

Defined in: src/providers/SqliteDatabaseProvider.ts:117

Run a further migration ledger on this connection, recorded in its own
table: an add-on that depends on the add-on owning this database brings
its own tables (ngdp-accounting-addons#13). Same rules as the ledger run at
open: once, in order, transactional, and a newer schema is refused.

#### Parameters

##### ledger

[`Migration`](../../sqliteMigrations/interfaces/Migration.md)[]

##### ledgerTable

`string`

#### Returns

[`MigrationReport`](../../sqliteMigrations/interfaces/MigrationReport.md)

***

### readOnce()

> `static` __readOnce__\<`T`\>(`file`, `key`, `read`): `T`

Defined in: src/providers/SqliteDatabaseProvider.ts:87

Read a database file once, read-only, under `key`, and close it (#1876):
nothing is migrated or written. Used for the copy a restore kept as
`*.pre-restore`, to read what the site had recorded just before the
restore replaced it.

#### Type Parameters

##### T

`T`

#### Parameters

##### file

`string`

##### key

`string`

##### read

(`db`) => `T`

#### Returns

`T`

***

### storage()

> __storage__(): `object`

Defined in: src/providers/SqliteDatabaseProvider.ts:125

Where the data lives and how big it is.

#### Returns

`object`

##### encrypted

> __encrypted__: `boolean`

##### location

> __location__: `string`

##### sizeBytes

> __sizeBytes__: `number`

#### Overrides

[`default`](../../BaseDatabaseProvider/classes/default.md).[`storage`](../../BaseDatabaseProvider/classes/default.md#storage)
