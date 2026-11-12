[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/DatabaseAuditProvider](../README.md) / default

# Class: default

Defined in: src/providers/DatabaseAuditProvider.ts:124

## Extends

- [`default`](../../BaseAuditProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `DatabaseAuditProvider`

Defined in: src/providers/DatabaseAuditProvider.ts:131

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`DatabaseAuditProvider`

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`constructor`](../../BaseAuditProvider/classes/default.md#constructor)

## Properties

### chainPrevHash

> `protected` __chainPrevHash__: `string` = `GENESIS_HASH`

Defined in: src/providers/BaseAuditProvider.ts:404

Hash of the last record this provider stamped (#1119).

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`chainPrevHash`](../../BaseAuditProvider/classes/default.md#chainprevhash)

***

### chainSeq

> `protected` __chainSeq__: `number` = `0`

Defined in: src/providers/BaseAuditProvider.ts:401

Sequence of the last record this provider stamped (#1119).

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`chainSeq`](../../BaseAuditProvider/classes/default.md#chainseq)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/BaseAuditProvider.ts:319

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`engine`](../../BaseAuditProvider/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BaseAuditProvider.ts:322

Whether provider has been initialized

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`initialized`](../../BaseAuditProvider/classes/default.md#initialized)

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`providerDescription`](../../BaseAuditProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`providerFeatures`](../../BaseAuditProvider/classes/default.md#providerfeatures)

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

[`default`](../../BaseAuditProvider/classes/default.md).[`providerName`](../../BaseAuditProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`providerVersion`](../../BaseAuditProvider/classes/default.md#providerversion)

## Methods

### backup()

> __backup__(): `Promise`\<[`AuditBackupData`](../../BaseAuditProvider/interfaces/AuditBackupData.md)\>

Defined in: src/providers/BaseAuditProvider.ts:799

Backup audit configuration and state (optional)

Default implementation provides basic backup data.
Subclasses can override to include provider-specific data.

#### Returns

`Promise`\<[`AuditBackupData`](../../BaseAuditProvider/interfaces/AuditBackupData.md)\>

Backup data

#### Async

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`backup`](../../BaseAuditProvider/classes/default.md#backup)

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

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`chainEnabled`](../../BaseAuditProvider/classes/default.md#chainenabled)

***

### cleanup()

> __cleanup__(`ctx?`): `Promise`\<`void`\>

Defined in: src/providers/DatabaseAuditProvider.ts:411

Remove the rows past `ngdpbase.audit.retentiondays` (#1537): in one
transaction, the oldest rows up to the last one older than the cutoff,
and a checkpoint naming that row's seq and hash, so what remains verifies
from it. The rows removed are a prefix in the order written. Recorded as
`security-event` / `audit-archive-purge` under `ctx`, the way the file
provider records removing an archive.

#### Parameters

##### ctx?

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md) = `...`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`cleanup`](../../BaseAuditProvider/classes/default.md#cleanup)

***

### close()

> __close__(): `Promise`\<`void`\>

Defined in: src/providers/DatabaseAuditProvider.ts:491

Write what is queued, and stop the timer. The connection is
DatabaseManager's, which closes it after this manager has shut down.

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`close`](../../BaseAuditProvider/classes/default.md#close)

***

### exportAuditLogs()

> `abstract` __exportAuditLogs__(`filters?`, `format?`): `Promise`\<`string`\>

Defined in: src/providers/DatabaseAuditProvider.ts:398

Export audit logs

#### Parameters

##### filters?

[`AuditFilters`](../../BaseAuditProvider/interfaces/AuditFilters.md) = `{}`

Export filters

##### format?

`"csv"` \| `"json"` = `'json'`

Export format ('json', 'csv')

#### Returns

`Promise`\<`string`\>

Exported data

#### Async

#### Throws

Always throws - must be implemented by subclass

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`exportAuditLogs`](../../BaseAuditProvider/classes/default.md#exportauditlogs)

***

### findRecordById()

> __findRecordById__(`id`): `Promise`\<`Record`\<`string`, `unknown`\> \| `null`\>

Defined in: src/providers/DatabaseAuditProvider.ts:338

The record with this id (#1523), through the unique index on `id`; a queued one first.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\> \| `null`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`findRecordById`](../../BaseAuditProvider/classes/default.md#findrecordbyid)

***

### flush()

> __flush__(): `Promise`\<`void`\>

Defined in: src/providers/DatabaseAuditProvider.ts:229

Write the queue in one transaction. A failure puts the batch back at the
front of the queue, so the order is kept for the retry, and rejects.
better-sqlite3 is synchronous, so two flushes never interleave.

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`flush`](../../BaseAuditProvider/classes/default.md#flush)

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

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`formatExport`](../../BaseAuditProvider/classes/default.md#formatexport)

***

### getAuditStats()

> `abstract` __getAuditStats__(`filters?`): `Promise`\<[`AuditStats`](../../BaseAuditProvider/interfaces/AuditStats.md)\>

Defined in: src/providers/DatabaseAuditProvider.ts:373

Get audit statistics

#### Parameters

##### filters?

[`AuditFilters`](../../BaseAuditProvider/interfaces/AuditFilters.md) = `{}`

Optional filters

#### Returns

`Promise`\<[`AuditStats`](../../BaseAuditProvider/interfaces/AuditStats.md)\>

Audit statistics

#### Async

#### Throws

Always throws - must be implemented by subclass

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`getAuditStats`](../../BaseAuditProvider/classes/default.md#getauditstats)

***

### getDurability()

> __getDurability__(): [`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

Defined in: src/providers/DatabaseAuditProvider.ts:477

As the file provider: `continue` records wait in memory for up to the
flush interval or the queue size; `refuse` records are committed
(SQLite `synchronous = FULL`) before the action completes.

#### Returns

[`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`getDurability`](../../BaseAuditProvider/classes/default.md#getdurability)

***

### getGuarantees()

> __getGuarantees__(): [`AuditReport`](../../BaseAuditProvider/interfaces/AuditReport.md)

Defined in: src/providers/DatabaseAuditProvider.ts:468

The guarantees held, with the witness and whether the database is encrypted at rest (#1537).

#### Returns

[`AuditReport`](../../BaseAuditProvider/interfaces/AuditReport.md)

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`getGuarantees`](../../BaseAuditProvider/classes/default.md#getguarantees)

***

### getProviderInfo()

> __getProviderInfo__(): `object`

Defined in: src/providers/DatabaseAuditProvider.ts:177

Get provider information

#### Returns

`object`

Provider metadata

##### description

> __description__: `string`

##### features

> __features__: `string`[]

##### name

> __name__: `string`

##### version

> __version__: `string`

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`getProviderInfo`](../../BaseAuditProvider/classes/default.md#getproviderinfo)

***

### headWitnessReport()

> `protected` __headWitnessReport__(): \{ `destination`: `string`; `intervalMinutes`: `number`; `lastPublishedAt`: `string` \| `null`; `lastSeq`: `number` \| `null`; \} \| `null`

Defined in: src/providers/BaseAuditProvider.ts:625

Where the chain head is published, or null when nothing publishes it
(#1138). Facts, not a claim — see the note on AuditReport.headWitness.

#### Returns

\{ `destination`: `string`; `intervalMinutes`: `number`; `lastPublishedAt`: `string` \| `null`; `lastSeq`: `number` \| `null`; \} \| `null`

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`headWitnessReport`](../../BaseAuditProvider/classes/default.md#headwitnessreport)

***

### initialize()

> `abstract` __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/DatabaseAuditProvider.ts:135

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

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`initialize`](../../BaseAuditProvider/classes/default.md#initialize)

***

### isHealthy()

> __isHealthy__(): `Promise`\<`boolean`\>

Defined in: src/providers/DatabaseAuditProvider.ts:457

The tables answer a query: the connection is open and the schema is there.

#### Returns

`Promise`\<`boolean`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`isHealthy`](../../BaseAuditProvider/classes/default.md#ishealthy)

***

### loadChainHead()

> `protected` __loadChainHead__(): `Promise`\<\{ `hash`: `string`; `seq`: `number`; \} \| `null`\>

Defined in: src/providers/DatabaseAuditProvider.ts:192

The newest row, else the newest checkpoint: a chain pruned to nothing still continues (#1537).

#### Returns

`Promise`\<\{ `hash`: `string`; `seq`: `number`; \} \| `null`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`loadChainHead`](../../BaseAuditProvider/classes/default.md#loadchainhead)

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

A subclass implements [writeEvent](../../BaseAuditProvider/classes/default.md#writeevent) — storage — and never sees the
un-stamped record, so it cannot skip the integrity step. Adding a fifth
provider gets tamper evidence without having to remember it.

#### Parameters

##### auditEvent

[`AuditEvent`](../../../types/Provider/interfaces/AuditEvent.md)

The event to record

#### Returns

`Promise`\<`string`\>

The stored event's id

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`logAuditEvent`](../../BaseAuditProvider/classes/default.md#logauditevent)

***

### prepareRecord()

> `protected` __prepareRecord__(`auditEvent`): `Record`\<`string`, `unknown`\>

Defined in: src/providers/DatabaseAuditProvider.ts:187

The stored shape, the same as the file provider's (#1537).

#### Parameters

##### auditEvent

`Record`\<`string`, `unknown`\>

#### Returns

`Record`\<`string`, `unknown`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`prepareRecord`](../../BaseAuditProvider/classes/default.md#preparerecord)

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

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`publishChainHead`](../../BaseAuditProvider/classes/default.md#publishchainhead)

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

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`restartChain`](../../BaseAuditProvider/classes/default.md#restartchain)

***

### restore()

> __restore__(`_backupData`): `Promise`\<`void`\>

Defined in: src/providers/BaseAuditProvider.ts:817

Restore audit from backup (optional)

Default implementation does nothing.
Subclasses can override if they support restore functionality.

#### Parameters

##### \_backupData

[`AuditBackupData`](../../BaseAuditProvider/interfaces/AuditBackupData.md)

Backup data

#### Returns

`Promise`\<`void`\>

#### Async

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`restore`](../../BaseAuditProvider/classes/default.md#restore)

***

### searchAuditLogs()

> `abstract` __searchAuditLogs__(`filters?`, `options?`): `Promise`\<[`AuditSearchResults`](../../BaseAuditProvider/interfaces/AuditSearchResults.md)\>

Defined in: src/providers/DatabaseAuditProvider.ts:323

Search audit logs

#### Parameters

##### filters?

[`AuditFilters`](../../BaseAuditProvider/interfaces/AuditFilters.md) = `{}`

Search filters

##### options?

`Record`\<`string`, `unknown`\> = `{}`

Search options

#### Returns

`Promise`\<[`AuditSearchResults`](../../BaseAuditProvider/interfaces/AuditSearchResults.md)\>

Search results

#### Async

#### Throws

Always throws - must be implemented by subclass

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`searchAuditLogs`](../../BaseAuditProvider/classes/default.md#searchauditlogs)

***

### searchEntriesAbout()

> __searchEntriesAbout__(`person`, `options?`): `Promise`\<[`AuditSearchResults`](../../BaseAuditProvider/interfaces/AuditSearchResults.md)\>

Defined in: src/providers/DatabaseAuditProvider.ts:355

The entries about one person (#1537): the person is the row's `user`,
its `actor`, or the owner of the resource it names (`metadata.owner`:
their identity `@id` from #2041 on, their username before).
Each is an indexed column. Newest first, a page at a time.

#### Parameters

##### person

`string`

##### options?

[`PersonEntriesOptions`](../../BaseAuditProvider/interfaces/PersonEntriesOptions.md) = `{}`

#### Returns

`Promise`\<[`AuditSearchResults`](../../BaseAuditProvider/interfaces/AuditSearchResults.md)\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`searchEntriesAbout`](../../BaseAuditProvider/classes/default.md#searchentriesabout)

***

### writeEvent()

> __writeEvent__(`record`): `Promise`\<`string`\>

Defined in: src/providers/DatabaseAuditProvider.ts:206

Queue a stamped record, or write it now (#1158): a `refuse` event writes
the queue and itself in one transaction before this resolves, and a
failure rejects. Through the queue, never around it, so rows land in
chain order.

#### Parameters

##### record

`Record`\<`string`, `unknown`\>

#### Returns

`Promise`\<`string`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`writeEvent`](../../BaseAuditProvider/classes/default.md#writeevent)
