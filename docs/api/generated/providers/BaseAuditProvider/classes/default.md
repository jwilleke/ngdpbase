[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuditProvider](../README.md) / default

# Abstract Class: default

Defined in: src/providers/BaseAuditProvider.ts:317

## Extends

- [`default`](../../BaseProvider/classes/default.md)

## Extended by

- [`default`](../../CloudAuditProvider/classes/default.md)
- [`default`](../../DatabaseAuditProvider/classes/default.md)
- [`default`](../../FileAuditProvider/classes/default.md)
- [`default`](../../NullAuditProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `BaseAuditProvider`

Defined in: src/providers/BaseAuditProvider.ts:331

Create a new audit provider

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The WikiEngine instance

#### Returns

`BaseAuditProvider`

#### Throws

If engine is not provided

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`constructor`](../../BaseProvider/classes/default.md#constructor)

## Properties

### chainPrevHash

> `protected` __chainPrevHash__: `string` = `GENESIS_HASH`

Defined in: src/providers/BaseAuditProvider.ts:404

Hash of the last record this provider stamped (#1119).

***

### chainSeq

> `protected` __chainSeq__: `number` = `0`

Defined in: src/providers/BaseAuditProvider.ts:401

Sequence of the last record this provider stamped (#1119).

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/BaseAuditProvider.ts:319

Reference to the wiki engine

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BaseAuditProvider.ts:322

Whether provider has been initialized

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerDescription`](../../BaseProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerFeatures`](../../BaseProvider/classes/default.md#providerfeatures)

***

### providerName?

> `protected` `optional` __providerName?__: `string`

Defined in: src/providers/BaseProvider.ts:73

What this provider calls itself (#1151).

`protected`, and set by a subclass in its constructor or field
initialisers. A provider that sets nothing reports the class name rather
than a placeholder, so the answer is never a lie — it is either what the
author chose or what the runtime knows.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerName`](../../BaseProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerVersion`](../../BaseProvider/classes/default.md#providerversion)

## Methods

### backup()

> __backup__(): `Promise`\<[`AuditBackupData`](../interfaces/AuditBackupData.md)\>

Defined in: src/providers/BaseAuditProvider.ts:799

Backup audit configuration and state (optional)

Default implementation provides basic backup data.
Subclasses can override to include provider-specific data.

#### Returns

`Promise`\<[`AuditBackupData`](../interfaces/AuditBackupData.md)\>

Backup data

#### Async

***

### chainEnabled()

> `protected` __chainEnabled__(): `boolean`

Defined in: src/providers/BaseAuditProvider.ts:414

Whether this provider chains its records (#1119).

True for anything that stores events. `NullAuditProvider` overrides it: it
keeps nothing, so it has nothing to chain — a legitimate state rather than
a hole, provided the instance cannot then CLAIM tamper evidence, which is
what `getProviderInfo().guarantees` is for.

#### Returns

`boolean`

***

### cleanup()

> `abstract` __cleanup__(): `Promise`\<`void`\>

Defined in: src/providers/BaseAuditProvider.ts:768

Clean up old audit logs based on retention policy

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### close()

> `abstract` __close__(): `Promise`\<`void`\>

Defined in: src/providers/BaseAuditProvider.ts:788

Close/cleanup the audit provider

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### exportAuditLogs()

> `abstract` __exportAuditLogs__(`filters?`, `format?`): `Promise`\<`string`\>

Defined in: src/providers/BaseAuditProvider.ts:745

Export audit logs

#### Parameters

##### filters?

[`AuditFilters`](../interfaces/AuditFilters.md)

Export filters

##### format?

`"csv"` \| `"json"`

Export format ('json', 'csv')

#### Returns

`Promise`\<`string`\>

Exported data

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### findRecordById()

> __findRecordById__(`_id`): `Promise`\<`Record`\<`string`, `unknown`\> \| `null`\>

Defined in: src/providers/BaseAuditProvider.ts:682

The stored record with this id, or null (#1523: a remembered browser's
row names the audit record of its sign-in, and is checked against it).
Null too from a provider that cannot look a record up by id.

#### Parameters

##### \_id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\> \| `null`\>

***

### flush()

> `abstract` __flush__(): `Promise`\<`void`\>

Defined in: src/providers/BaseAuditProvider.ts:758

Flush pending audit events to storage

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### formatExport()

> `protected` __formatExport__(`results`, `format`): `string`

Defined in: src/providers/BaseAuditProvider.ts:645

One export format for every provider: JSON as stored, or CSV through
ExportManager's writer — quoting, and no cell a spreadsheet would run as a
formula.

#### Parameters

##### results

readonly [`AuditEvent`](../../../types/Provider/interfaces/AuditEvent.md)[]

##### format

`"csv"` \| `"json"`

#### Returns

`string`

***

### getAuditStats()

> `abstract` __getAuditStats__(`filters?`): `Promise`\<[`AuditStats`](../interfaces/AuditStats.md)\>

Defined in: src/providers/BaseAuditProvider.ts:733

Get audit statistics

#### Parameters

##### filters?

[`AuditFilters`](../interfaces/AuditFilters.md)

Optional filters

#### Returns

`Promise`\<[`AuditStats`](../interfaces/AuditStats.md)\>

Audit statistics

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### getDurability()

> __getDurability__(): [`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

Defined in: src/providers/BaseProvider.ts:111

What this provider does with a record before it is durably stored.

Null means the provider has not stated it — silence rather than a default.
A provider that buffers and forgets to declare it must not inherit an
assertion that it writes immediately, which is precisely the bug this
contract replaces. A reporting layer renders null as "not stated", never
as "durable".

#### Returns

[`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`getDurability`](../../BaseProvider/classes/default.md#getdurability)

***

### getGuarantees()

> __getGuarantees__(): [`AuditReport`](../interfaces/AuditReport.md)

Defined in: src/providers/BaseAuditProvider.ts:382

What this provider actually guarantees (#1119).

Reportable rather than inferable. A security property that has to be
deduced from configuration is not one an instance can be assessed on — so
an operator or an assessor asks the system instead of reading the config
and hoping.

`tamperEvident` follows from the chain and is therefore true for every
storing provider and false for the inert one, without a subclass having to
remember to say so.

#### Returns

[`AuditReport`](../interfaces/AuditReport.md)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/BaseAuditProvider.ts:361

Get provider information

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`getProviderInfo`](../../BaseProvider/classes/default.md#getproviderinfo)

***

### headWitnessReport()

> `protected` __headWitnessReport__(): \{ `destination`: `string`; `intervalMinutes`: `number`; `lastPublishedAt`: `string` \| `null`; `lastSeq`: `number` \| `null`; \} \| `null`

Defined in: src/providers/BaseAuditProvider.ts:625

Where the chain head is published, or null when nothing publishes it
(#1138). Facts, not a claim — see the note on AuditReport.headWitness.

#### Returns

\{ `destination`: `string`; `intervalMinutes`: `number`; `lastPublishedAt`: `string` \| `null`; `lastSeq`: `number` \| `null`; \} \| `null`

***

### initialize()

> `abstract` __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/BaseAuditProvider.ts:354

Initialize the audit provider

Implementations should load configuration from ConfigurationManager:
  const configManager = this.engine.getManager('ConfigurationManager');
  const value = configManager.getProperty('key', 'default');

Do NOT read configuration files directly.

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### isHealthy()

> `abstract` __isHealthy__(): `Promise`\<`boolean`\>

Defined in: src/providers/BaseAuditProvider.ts:778

Check if the audit provider is healthy

#### Returns

`Promise`\<`boolean`\>

True if healthy

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### loadChainHead()

> `protected` __loadChainHead__(): `Promise`\<\{ `hash`: `string`; `seq`: `number`; \} \| `null`\>

Defined in: src/providers/BaseAuditProvider.ts:427

Resume the chain from storage, or null to start a new one (#1119).

Called once, lazily, before the first record is stamped. A provider that
cannot resume returns null and starts a fresh chain — honest, and visible
as a `seq` restarting at 1 rather than as a silent break.

#### Returns

`Promise`\<\{ `hash`: `string`; `seq`: `number`; \} \| `null`\>

***

### logAuditEvent()

> __logAuditEvent__(`auditEvent`): `Promise`\<`string`\>

Defined in: src/providers/BaseAuditProvider.ts:450

Record an audit event.

__Deliberately concrete and not overridable in spirit.__ Integrity is a
property of the CONTRACT, not of one implementation: stamped in a subclass
it would protect that subclass only, and whether an instance were
tamper-evident would depend on which storage backend was configured. "It
depends on your backend" is not an answer that survives an assessment.

A subclass implements [writeEvent](#writeevent) — storage — and never sees the
un-stamped record, so it cannot skip the integrity step. Adding a fifth
provider gets tamper evidence without having to remember it.

#### Parameters

##### auditEvent

[`AuditEvent`](../../../types/Provider/interfaces/AuditEvent.md)

The event to record

#### Returns

`Promise`\<`string`\>

The stored event's id

***

### prepareRecord()

> `protected` __prepareRecord__(`record`): `Record`\<`string`, `unknown`\>

Defined in: src/providers/BaseAuditProvider.ts:695

Normalise an incoming event into the record that will be stored (#1119).

Identity by default. A provider that assigns its own id, timestamp or
field shape overrides this rather than doing it in [writeEvent](#writeevent),
because the stamp must cover exactly what is written.

#### Parameters

##### record

`Record`\<`string`, `unknown`\>

#### Returns

`Record`\<`string`, `unknown`\>

***

### publishChainHead()

> `protected` __publishChainHead__(): `Promise`\<`void`\>

Defined in: src/providers/BaseAuditProvider.ts:577

Publish the chain head to the configured destination (#1138), after the
records it names are stored — never before, or the next verification
would report truncation.

The chain cannot detect truncation of its own tail — removing records from
the end breaks no link — and it cannot be fixed locally, because an
attacker who owns the machine owns anything the machine wrote locally. So
the head goes to wherever the operator points it, and this code takes no
view on whether that is genuinely off-box (D13): it reports the
destination and never claims what the destination is (D21).

Failure to publish is logged and swallowed. An instance that refuses to
serve because it could not write a witness would be trading a working
system for a detection property, which is the wrong way round — and the
absence of a fresh witness is itself visible in getGuarantees().

#### Returns

`Promise`\<`void`\>

***

### restartChain()

> __restartChain__(`reason`, `ctx`): `Promise`\<`string`\>

Defined in: src/providers/BaseAuditProvider.ts:495

Begin a new chain, recording that the old one was abandoned (#1124).

__Never called automatically.__ A system that silently repairs its own
audit chain is worse than one that stays visibly broken, so this exists
only for an explicit operator action — `npm run audit:restart-chain`.

The marker is written INTO the log as an ordinary record, which is what
stops it being an escape hatch: an attacker who wants a clean chain has to
leave a record saying they broke it. It does not repair the past — the
abandoned segment stays in the file and stays unverifiable. It only says
the discontinuity is known, by whom, and why.

#### Parameters

##### reason

`string`

Why the chain is being restarted. Recorded verbatim.

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who authorised it (#1179): the operator's context, never a bare name.

#### Returns

`Promise`\<`string`\>

The id of the marker record.

***

### restore()

> __restore__(`_backupData`): `Promise`\<`void`\>

Defined in: src/providers/BaseAuditProvider.ts:817

Restore audit from backup (optional)

Default implementation does nothing.
Subclasses can override if they support restore functionality.

#### Parameters

##### \_backupData

[`AuditBackupData`](../interfaces/AuditBackupData.md)

Backup data

#### Returns

`Promise`\<`void`\>

#### Async

***

### searchAuditLogs()

> `abstract` __searchAuditLogs__(`filters?`, `options?`): `Promise`\<[`AuditSearchResults`](../interfaces/AuditSearchResults.md)\>

Defined in: src/providers/BaseAuditProvider.ts:719

Search audit logs

#### Parameters

##### filters?

[`AuditFilters`](../interfaces/AuditFilters.md)

Search filters

##### options?

`Record`\<`string`, `unknown`\>

Search options

#### Returns

`Promise`\<[`AuditSearchResults`](../interfaces/AuditSearchResults.md)\>

Search results

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### searchEntriesAbout()

> __searchEntriesAbout__(`_person`, `_options?`): `Promise`\<[`AuditSearchResults`](../interfaces/AuditSearchResults.md)\>

Defined in: src/providers/BaseAuditProvider.ts:673

The entries about one person, newest first, a page at a time (#1537):
those where the person is the `user`, the `actor`, or the resource's
owner ([recordIsAbout](../functions/recordIsAbout.md)). A provider that cannot answer says so,
rather than returning an empty page that reads as "nothing happened".

#### Parameters

##### \_person

`string`

##### \_options?

[`PersonEntriesOptions`](../interfaces/PersonEntriesOptions.md) = `{}`

#### Returns

`Promise`\<[`AuditSearchResults`](../interfaces/AuditSearchResults.md)\>

***

### writeEvent()

> `abstract` __writeEvent__(`record`): `Promise`\<`string`\>

Defined in: src/providers/BaseAuditProvider.ts:707

Store an already-stamped record.

#### Parameters

##### record

`Record`\<`string`, `unknown`\>

The record to store, with seq/prevHash/hash already applied

#### Returns

`Promise`\<`string`\>

Event ID

#### Async
