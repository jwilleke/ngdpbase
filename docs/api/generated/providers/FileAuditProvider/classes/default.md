[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FileAuditProvider](../README.md) / default

# Class: default

Defined in: src/providers/FileAuditProvider.ts:57

## Extends

- [`default`](../../BaseAuditProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `FileAuditProvider`

Defined in: src/providers/FileAuditProvider.ts:72

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`FileAuditProvider`

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

Defined in: src/providers/FileAuditProvider.ts:936

Backup audit configuration and statistics

#### Returns

`Promise`\<[`AuditBackupData`](../../BaseAuditProvider/interfaces/AuditBackupData.md)\>

Backup data

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`backup`](../../BaseAuditProvider/classes/default.md#backup)

***

### backupFiles()

> __backupFiles__(`options`): `Promise`\<\{ `data`: [`BackupPartRecord`](../../../managers/BaseManager/interfaces/BackupPartRecord.md); `warnings`: `string`[]; \}\>

Defined in: src/providers/FileAuditProvider.ts:853

The audit log in a backup (#1876): the live log and every archive, as
they are on disk, with the hash chain they carry, as
`<stem>.audit.tar` beside the document (`.tar.enc` under the backup
key). The queue is flushed first, so every record accepted before the
backup is in it. Only the audit files: the application logs in the same
folder are not.

#### Parameters

##### options

[`ManagerBackupOptions`](../../../managers/BaseManager/interfaces/ManagerBackupOptions.md)

#### Returns

`Promise`\<\{ `data`: [`BackupPartRecord`](../../../managers/BaseManager/interfaces/BackupPartRecord.md); `warnings`: `string`[]; \}\>

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

Defined in: src/providers/FileAuditProvider.ts:686

Clean up old audit logs based on retention policy

#### Parameters

##### ctx?

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md) = `...`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`cleanup`](../../BaseAuditProvider/classes/default.md#cleanup)

***

### close()

> `abstract` __close__(): `Promise`\<`void`\>

Defined in: src/providers/FileAuditProvider.ts:814

Close/cleanup the audit provider

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`close`](../../BaseAuditProvider/classes/default.md#close)

***

### exportAuditLogs()

> __exportAuditLogs__(`filters?`, `format?`): `Promise`\<`string`\>

Defined in: src/providers/FileAuditProvider.ts:509

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

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`exportAuditLogs`](../../BaseAuditProvider/classes/default.md#exportauditlogs)

***

### findRecordById()

> __findRecordById__(`id`): `Promise`\<`Record`\<`string`, `unknown`\> \| `null`\>

Defined in: src/providers/FileAuditProvider.ts:521

The record with this id (#1523): the queue and the records held in
memory, then the live log and its archives, newest first, a line at a
time. Only a line that holds the id is parsed. A remembered browser's
sign-in is at most `remember-days` old, so the search usually ends in the
live log; a record whose archive was removed is not found.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\> \| `null`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`findRecordById`](../../BaseAuditProvider/classes/default.md#findrecordbyid)

***

### flush()

> __flush__(`options?`): `Promise`\<`void`\>

Defined in: src/providers/FileAuditProvider.ts:568

Flush pending audit events to storage

#### Parameters

##### options?

###### fsync?

`boolean`

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

> __getAuditStats__(`filters?`): `Promise`\<[`AuditStats`](../../BaseAuditProvider/interfaces/AuditStats.md)\>

Defined in: src/providers/FileAuditProvider.ts:450

Get audit statistics

#### Parameters

##### filters?

[`AuditFilters`](../../BaseAuditProvider/interfaces/AuditFilters.md) = `{}`

Optional filters

#### Returns

`Promise`\<[`AuditStats`](../../BaseAuditProvider/interfaces/AuditStats.md)\>

Audit statistics

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`getAuditStats`](../../BaseAuditProvider/classes/default.md#getauditstats)

***

### getDurability()

> __getDurability__(): [`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

Defined in: src/providers/FileAuditProvider.ts:795

What this provider does with a record before it is on disk (#1148).

It buffers, except on the refuse-on-failure rule. `writeEvent` queues in memory, a
timer flushes on `ngdpbase.audit.flushinterval`, and an early flush is
forced at `ngdpbase.audit.maxqueuesize`. That write is `fs.appendFile` with
no fsync, so even a flushed `standard` or `volume` record sits in the OS
page cache.

A `critical` event does not wait for any of that: it is written and
`fsync`ed before `writeEvent` resolves (#1158), which is what makes the
rule's own definition — *the action must not complete unless the record
does* — true rather than declared.

Reported rather than judged: an operator who can see a 30-second window on
one rule and none on the other decides whether that is acceptable for their
deployment. The `durable: true` this replaces decided it for them, wrongly.

The bound is still the machine. `fsync` trusts a disk controller's cache,
and a failed disk takes the log with it — off-box is #1138.

#### Returns

[`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`getDurability`](../../BaseAuditProvider/classes/default.md#getdurability)

***

### getGuarantees()

> __getGuarantees__(): [`AuditReport`](../../BaseAuditProvider/interfaces/AuditReport.md)

Defined in: src/providers/FileAuditProvider.ts:770

Where the chain head is published, or null when nothing publishes it (#1138).

#### Returns

[`AuditReport`](../../BaseAuditProvider/interfaces/AuditReport.md)

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`getGuarantees`](../../BaseAuditProvider/classes/default.md#getguarantees)

***

### getProviderInfo()

> __getProviderInfo__(): `object`

Defined in: src/providers/FileAuditProvider.ts:174

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

> __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/FileAuditProvider.ts:84

Initialize the file audit provider

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`initialize`](../../BaseAuditProvider/classes/default.md#initialize)

***

### isHealthy()

> __isHealthy__(): `Promise`\<`boolean`\>

Defined in: src/providers/FileAuditProvider.ts:754

Check if the audit provider is healthy

#### Returns

`Promise`\<`boolean`\>

True if healthy

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`isHealthy`](../../BaseAuditProvider/classes/default.md#ishealthy)

***

### loadChainHead()

> `protected` __loadChainHead__(): `Promise`\<\{ `hash`: `string`; `seq`: `number`; \} \| `null`\>

Defined in: src/providers/FileAuditProvider.ts:254

Resume the chain from the last record on disk (#1119).

Without this the sequence restarts at 1 on every boot, which reads as a
chain break at each restart and makes the whole mechanism useless — a
verifier could not tell a restart from a deletion.

Reads the tail of the log rather than parsing all of it: on a large file
only the final record matters, and this runs once per process.

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

Defined in: src/providers/FileAuditProvider.ts:304

Normalise an incoming event into the stored record shape (#1119).

Split out of `logAuditEvent` so it runs BEFORE the base stamps the chain:
the id and timestamp assigned here are part of what gets hashed, and
assigning them afterwards would mean the hash covered a record different
from the one written.

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

> __searchAuditLogs__(`filters?`, `options?`): `Promise`\<[`AuditSearchResults`](../../BaseAuditProvider/interfaces/AuditSearchResults.md)\>

Defined in: src/providers/FileAuditProvider.ts:365

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

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`searchAuditLogs`](../../BaseAuditProvider/classes/default.md#searchauditlogs)

***

### searchEntriesAbout()

> __searchEntriesAbout__(`person`, `options?`): `Promise`\<[`AuditSearchResults`](../../BaseAuditProvider/interfaces/AuditSearchResults.md)\>

Defined in: src/providers/FileAuditProvider.ts:549

The entries about one person (#1537), from the records held in memory —
the same window `searchAuditLogs` reads. Newest first, a page at a time.

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

### stageRestore()

> __stageRestore__(`data`, `options`): `Promise`\<`void`\>

Defined in: src/providers/FileAuditProvider.ts:874

Stage the audit files from a backup for the next start (#1876): extracted
into `<audit.log>.staged/`, after checking the archive holds audit files
only, and recorded in the site restore. The live log is not touched; the
site keeps recording into it until the restart.

#### Parameters

##### data

[`BackupPartRecord`](../../../managers/BaseManager/interfaces/BackupPartRecord.md)

##### options

[`ManagerRestoreOptions`](../../../managers/BaseManager/interfaces/ManagerRestoreOptions.md) & `object`

#### Returns

`Promise`\<`void`\>

***

### writeEvent()

> __writeEvent__(`record`): `Promise`\<`string`\>

Defined in: src/providers/FileAuditProvider.ts:334

Queue an already-stamped record for the next flush (#1119), or write it
through to the device now if its on-failure rule demands that (#1158).

The base has applied seq, prevHash and hash by this point; this only
decides when the bytes reach disk.

__An on-failure: refuse event is written and fsynced before this resolves.__ The
registry defines `critical` as *"the action must not complete unless the
record does"*, and a 30-second timer flushing into the page cache does not
deliver that: `page-delete`, `token-mint`, `token-revoke`, the lifecycle
events and `posture-recorded` could all be lost by an unclean exit while
the action they describe had already happened. A credential that exists
with nothing saying so is the case the rule was written for.

__It goes through the queue rather than around it__, even though the issue
described bypassing. The records are hash-chained, so the file must hold
them in sequence order; a critical record written directly while earlier
standard records were still queued would land out of order and break
verification at that point. Flushing the queue *including* this record
keeps the chain intact and still returns only once the bytes are down.

`standard` and `volume` are deliberately untouched — making every event
synchronous would charge `page-read` at volume for a guarantee the #1109
decision says it does not need.

#### Parameters

##### record

`Record`\<`string`, `unknown`\>

#### Returns

`Promise`\<`string`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`writeEvent`](../../BaseAuditProvider/classes/default.md#writeevent)
