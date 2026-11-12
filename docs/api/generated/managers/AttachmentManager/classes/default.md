[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AttachmentManager](../README.md) / default

# Class: default

Defined in: src/managers/AttachmentManager.ts:318

The Manager-layer contract for asset sources (Decision 7).

PageManager / MediaManager / AttachmentManager each implement this
during their `initialize()`, registering themselves with
CatalogManager via `registerSource()`. Storage providers underneath
stay diverse and pluggable per-deployment.

ACL filtering happens here (each source knows its permission model).
`get()` returns `null` for both not-found and ACL-filtered; only throw
on actual errors.

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Implements

- [`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md)

## Constructors

### Constructor

> __new default__(`engine`): `AttachmentManager`

Defined in: src/managers/AttachmentManager.ts:357

Creates a new AttachmentManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`AttachmentManager`

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`constructor`](../../BaseManager/classes/default.md#constructor)

## Properties

### config?

> `protected` `optional` __config?__: `Record`\<`string`, `unknown`\>

Defined in: src/managers/BaseManager.ts:325

Configuration passed during initialization

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`config`](../../BaseManager/classes/default.md#config)

***

### CURRENT\_SCHEMA\_VERSION

> `readonly` `static` __CURRENT\_SCHEMA\_VERSION__: `1` = `1`

Defined in: src/managers/AttachmentManager.ts:336

On-disk schema version for attachment-metadata.json (Decision 6).
Bump when the persisted SchemaCreativeWork shape changes; current v1 is
the post-Slice-5 (#759) shape including documentTitle / documentAuthor /
documentSubject / documentKeywords / documentDateCreated /
documentDateModified / inLanguage.

***

### currentSchemaVersion

> `readonly` __currentSchemaVersion__: `1` = `AttachmentManager.CURRENT_SCHEMA_VERSION`

Defined in: src/managers/AttachmentManager.ts:337

Schema version of the on-disk records this source writes/reads.
Compared against the manager's CURRENT_SCHEMA_VERSION constant on
startup (Decision 6).

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`currentSchemaVersion`](../../../types/Schema/interfaces/CatalogSource.md#currentschemaversion)

***

### description?

> `readonly` `optional` __description?__: `string`

Defined in: src/managers/BaseManager.ts:335

Short description of what this manager does.
Used by admin UIs, addon registries, and introspection tools.
Override in subclasses to provide a human-readable description.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`description`](../../BaseManager/classes/default.md#description)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:319

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`engine`](../../BaseManager/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/managers/BaseManager.ts:322

Initialization status flag

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`initialized`](../../BaseManager/classes/default.md#initialized)

***

### sourceId

> `readonly` __sourceId__: `"attachments"` = `'attachments'`

Defined in: src/managers/AttachmentManager.ts:320

CatalogSource identifier (Slice 5 of #755 / #759).

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`sourceId`](../../../types/Schema/interfaces/CatalogSource.md#sourceid)

***

### types

> `readonly` __types__: readonly [`SchemaType`](../../../types/Schema/type-aliases/SchemaType.md)[]

Defined in: src/managers/AttachmentManager.ts:327

Subtypes this source produces. Today only DigitalDocument (PDFs / docx /
xlsx / pptx). Image and video attachments emit a `DigitalDocument` stub
since the rich ImageObject / VideoObject mapper lives on the media path.

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`types`](../../../types/Schema/interfaces/CatalogSource.md#types)

## Accessors

### provider

#### Get Signature

> __get__ __provider__(): `BaseAttachmentProvider` \| `null`

Defined in: src/managers/AttachmentManager.ts:364

Return the active attachment provider for use by AssetManager.

##### Returns

`BaseAttachmentProvider` \| `null`

## Methods

### assertMayEditPage()

> __assertMayEditPage__(`ctx`, `pageName`): `Promise`\<`void`\>

Defined in: src/managers/AttachmentManager.ts:1076

A file is added to a private page only by someone who may edit it: the
page's own decision (#1398). Asked here by `attachToPage`, and by
FileManager's page-tied upload (#2148).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### pageName

`string`

#### Returns

`Promise`\<`void`\>

***

### attachmentExists()

> __attachmentExists__(`attachmentId`): `Promise`\<`boolean`\>

Defined in: src/managers/AttachmentManager.ts:2612

Check if an attachment exists

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<`boolean`\>

***

### attachToPage()

> __attachToPage__(`attachmentId`, `pageName`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/AttachmentManager.ts:1105

Attach an existing attachment to a page

#### Parameters

##### attachmentId

`string`

Attachment identifier

##### pageName

`string`

Page name to attach to

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose mention this is (#1179). Mandatory and positional.

#### Returns

`Promise`\<`boolean`\>

Success status

***

### backfillDocMetadata()

> __backfillDocMetadata__(`onProgress?`): `Promise`\<\{ `errors`: `number`; `scanned`: `number`; `skipped`: `number`; `updated`: `number`; \}\>

Defined in: src/managers/AttachmentManager.ts:550

Re-extract embedded document metadata across every stored attachment.
Same operation as [rebuild](#rebuild) but returns the summary so the
`attachments.rebuild` background job can produce a per-run report.
Returns `{scanned, updated, skipped, errors}` zeros when the provider
isn't initialised yet (caller can branch on this).

#### Parameters

##### onProgress?

(`processed`, `total`) => `void`

#### Returns

`Promise`\<\{ `errors`: `number`; `scanned`: `number`; `skipped`: `number`; `updated`: `number`; \}\>

***

### backup()

> __backup__(`options?`): `Promise`\<[`AttachmentBackupData`](../interfaces/AttachmentBackupData.md)\>

Defined in: src/managers/AttachmentManager.ts:3133

Backup manager data
Delegates to provider's backup method

#### Parameters

##### options?

[`ManagerBackupOptions`](../../BaseManager/interfaces/ManagerBackupOptions.md)

#### Returns

`Promise`\<[`AttachmentBackupData`](../interfaces/AttachmentBackupData.md)\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### backupFolders()

> __backupFolders__(): [`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

Defined in: src/managers/BaseManager.ts:390

Where this manager keeps its data as folders or files (#1985): declared,
never backed up by hand. BackupManager archives each beside the backup
document (`<stem>.<part>.tar`), stages it in a site restore, and puts the
staged copy in place at the next start, in `initialize()` above, before
the subclass reads it. Resolved from the configuration, so it can be
answered before the subclass's own `initialize()` has run. Default none.

A manager with data in the document as well keeps its `backup()`; a
declared part's record goes beside that data (`data[part]`), or is the
entry's `data` when the manager has none and declares one part.

#### Returns

[`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`backupFolders`](../../BaseManager/classes/default.md#backupfolders)

***

### basenameOf()

> `static` __basenameOf__(`src`): `string`

Defined in: src/managers/AttachmentManager.ts:2762

Final path segment of a reference, or '' when there is none (#1051).

Returns '' for a trailing slash so callers can skip rather than searching
for an empty filename, which `getAttachmentByFilename` would answer
unpredictably.

#### Parameters

##### src

`string`

#### Returns

`string`

***

### convertUploadersAtBoot()

> __convertUploadersAtBoot__(): `Promise`\<`void`\>

Defined in: src/managers/AttachmentManager.ts:986

Once, at start-up (#2097): the shared pool's uploaders and editors become
identity

#### Returns

`Promise`\<`void`\>

#### Ids

(`IdentityManager.convertRecordedUser`: an orphan for a
name with no account, `orphan:unknown` for the pool's `Unknown`), written
once through the provider, under the system context. A second start
writes nothing. Counts only in the log; orphans on the dashboard. When the
identity store cannot answer, nothing is written and the next start tries
again. A vault's files convert when the vault is opened
([convertVaultUploaders](#convertvaultuploaders)).

***

### convertVaultUploaders()

> __convertVaultUploaders__(`ctx`): `Promise`\<`number`\>

Defined in: src/managers/AttachmentManager.ts:1018

The uploaders in the vaults of the context's own user that it can open
(#2097), when they are opened: at sign-in and unlock. Each vault's files
index, through its own I/O. Nothing is written when the identity store
cannot answer; the next opening tries again.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`number`\>

***

### deleteAttachment()

> __deleteAttachment__(`attachmentId`, `context`, `wikiContext?`): `Promise`\<`boolean`\>

Defined in: src/managers/AttachmentManager.ts:2427

Delete an attachment

#### Parameters

##### attachmentId

`string`

Attachment identifier

##### context

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is acting (#1179): the request's subject, or a JobContext

##### wikiContext?

###### request?

\{ `ip?`: `string`; \} \| `null`

#### Returns

`Promise`\<`boolean`\>

Success status

***

### detachFromPage()

> __detachFromPage__(`attachmentId`, `pageName`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/AttachmentManager.ts:1170

Detach an attachment from a page

#### Parameters

##### attachmentId

`string`

Attachment identifier

##### pageName

`string`

Page name to detach from

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose mention this is (#1179). Mandatory and positional.

#### Returns

`Promise`\<`boolean`\>

Success status

***

### extractAttachmentIdRefs()

> `static` __extractAttachmentIdRefs__(`content`): `Set`\<`string`\>

Defined in: src/managers/AttachmentManager.ts:2853

# 865: identifier-URL references — `/attachments/<sha256>` anywhere in
content (markdown images/links, raw URLs). Storybook-generated day pages
embed route maps this way (`![Day 4 route](/attachments/<id>)`); these
are real render-time references and count as mentions.

#### Parameters

##### content

`string`

#### Returns

`Set`\<`string`\>

***

### extractLocalAttachmentRefs()

> `static` __extractLocalAttachmentRefs__(`content`): `Set`\<`string`\>

Defined in: src/managers/AttachmentManager.ts:2834

Canonical local-attachment reference extraction — `[{Image src='…'}]` /
`[{ATTACH src='…'}]` filenames, skipping media:// URIs, external URLs,
and absolute paths. Shared by save-time mention sync, the batch
reconciler (scripts/reconcile-attachment-mentions.ts mirrors it), and the
# 865 health report.

#### Parameters

##### content

`string`

#### Returns

`Set`\<`string`\>

***

### findVaultPagesUsingPoolFiles()

> __findVaultPagesUsingPoolFiles__(): `Promise`\<[`VaultPagePoolFiles`](../interfaces/VaultPagePoolFiles.md)[]\>

Defined in: src/managers/AttachmentManager.ts:2180

Vault pages that still use files in the shared pool (#1842): left by moves
into a vault before #1842, when the page went and its files stayed. Such a
file is served like any public attachment. Read only, and no key is used:

- a shared record whose mentions name a vault page (`page: null`, so the
  title in that mention is never repeated)
- in each vault that is not sealed, a page (`{uuid}.md`) whose content
  references a shared-pool file the vault does not hold itself
- in each vault that is not sealed, a page using a file the vault holds
  whose pool copy under the same id no public page that exists now uses
  (its mentions are stale, or name only vault pages): the copy an earlier
  repair left behind, which a repair run again removes. Such a file no
  page's content or title claims is counted for the vault (`page: null`)

A sealed vault's pages can't be read without their owner's key, so they are
not checked here.

#### Returns

`Promise`\<[`VaultPagePoolFiles`](../interfaces/VaultPagePoolFiles.md)[]\>

***

### get()

> __get__(`identifier`): `Promise`\<[`CreativeWork`](../../../types/Schema/type-aliases/CreativeWork.md) \| `null`\>

Defined in: src/managers/AttachmentManager.ts:514

CatalogSource.get — fetch a single attachment by stable identifier.
Returns null for not-found.

Note: this does NOT enforce private-page ACL. CatalogManager callers
should layer ACL on top (mirroring `getAttachment()` which goes through
the request path with full WikiContext).

#### Parameters

##### identifier

`string`

#### Returns

`Promise`\<[`CreativeWork`](../../../types/Schema/type-aliases/CreativeWork.md) \| `null`\>

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`get`](../../../types/Schema/interfaces/CatalogSource.md#get)

***

### getAllAttachments()

> __getAllAttachments__(`ctx`): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

Defined in: src/managers/AttachmentManager.ts:2382

Every attachment this requester may see: the shared pool, plus their own
private stores' files (#1460).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose reading this is (#1179). Mandatory and positional.

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

***

### getAttachment()

> __getAttachment__(`attachmentId`): `Promise`\<\{ `buffer`: `Buffer`; `metadata`: [`AttachmentMetadata`](../interfaces/AttachmentMetadata.md); \} \| `null`\>

Defined in: src/managers/AttachmentManager.ts:1200

Get an attachment by ID

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<\{ `buffer`: `Buffer`; `metadata`: [`AttachmentMetadata`](../interfaces/AttachmentMetadata.md); \} \| `null`\>

***

### getAttachmentByFilename()

> __getAttachmentByFilename__(`filename`, `ctx`): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md) \| `null`\>

Defined in: src/managers/AttachmentManager.ts:2358

Find an attachment by its original filename.

The shared pool first, then the requester's own stores (#1460): a public
page's markup must resolve to the same file for everyone who can read it,
so a private file of the reader's never shadows a public record of the
same name. A private file uploaded ONTO a page is still found before
either, by [resolveAttachmentSrc](#resolveattachmentsrc), which asks the page's own files.

#### Parameters

##### filename

`string`

Original filename to search for

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose reading this is (#1179). Mandatory and positional.

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md) \| `null`\>

***

### getAttachmentMetadata()

> __getAttachmentMetadata__(`attachmentId`): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md) \| `null`\>

Defined in: src/managers/AttachmentManager.ts:2318

Get attachment metadata only

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md) \| `null`\>

***

### getAttachmentsForPage()

> __getAttachmentsForPage__(`pageName`, `ctx`): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

Defined in: src/managers/AttachmentManager.ts:2335

Every file attached to a page that this requester may see: the shared
pool's records, plus the requester's own private-store files that name
the page (#1460). Another user's, and an admin's view of anyone's, are
not merged — ownPrivateStores reads `ctx`'s container and no other.

#### Parameters

##### pageName

`string`

Page name

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose reading this is (#1179). Mandatory and positional.

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

***

### getAttachmentUrl()

> __getAttachmentUrl__(`attachmentId`): `string`

Defined in: src/managers/AttachmentManager.ts:2626

Get attachment URL

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`string`

URL path

***

### getCurrentAttachmentProvider()

> __getCurrentAttachmentProvider__(): `BaseAttachmentProvider` \| `null`

Defined in: src/managers/AttachmentManager.ts:569

Get current attachment provider

#### Returns

`BaseAttachmentProvider` \| `null`

Current provider instance

***

### getEngine()

> __getEngine__(): [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:458

Get the wiki engine instance

#### Returns

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Example

```ts
const config = this.getEngine().getConfig();
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getEngine`](../../BaseManager/classes/default.md#getengine)

***

### getHealthReport()

> __getHealthReport__(`ctx`): `Promise`\<\{ `brokenRefs`: `object`[]; `looseTextRefs`: `string`[]; `missingFiles`: `object`[]; `orphans`: `object`[]; `recordlessFiles`: `string`[]; `totals`: \{ `diskFiles`: `number`; `pagesScanned`: `number`; `records`: `number`; \}; \}\>

Defined in: src/managers/AttachmentManager.ts:2960

# 865 Slice 2: attachment health report — computed fresh on demand
(admin-triggered; walks every page's content, a few seconds on large
instances). Read-only. Trustworthy only after mentions reconciliation
(run `npm run reconcile:mentions` / rely on save-time sync).

Sections:

- orphans:         records no page references (empty mentions)
- recordlessFiles: disk files with no metadata record
- missingFiles:    records whose storage file is gone from disk
- brokenRefs:      page markup references naming no record (ref → pages)
- looseTextRefs:   record filenames appearing in content OUTSIDE
                    canonical markup (never tracked as mentions)

# 1460: the requester's OWN private-store files are merged into the record
set, so one of their files is not reported as a broken reference merely
because it is in no shared index. `recordlessFiles` and `missingFiles`
stay shared-pool questions — they compare the shared index against the
shared storage folder, which a store's files are not in.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose report this is (#1179). Mandatory and positional; an
  admin sees their own stores merged, never anyone else's.

#### Returns

`Promise`\<\{ `brokenRefs`: `object`[]; `looseTextRefs`: `string`[]; `missingFiles`: `object`[]; `orphans`: `object`[]; `recordlessFiles`: `string`[]; `totals`: \{ `diskFiles`: `number`; `pagesScanned`: `number`; `records`: `number`; \}; \}\>

***

### getManagerStats()

> __getManagerStats__(): `Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/AttachmentManager.ts:2369

# 1006: how many attachments this instance holds. Count only, never metadata.

#### Returns

`Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`getManagerStats`](../../BaseManager/classes/default.md#getmanagerstats)

***

### getManagerStatus()

> __getManagerStatus__(): [`ManagerStatus`](../../BaseManager/interfaces/ManagerStatus.md)

Defined in: src/managers/BaseManager.ts:528

What this manager is doing (#1155).

Not `getStatus()`: that name is already taken by `AddonsManager` and
`BackgroundJobManager` for entirely different things, and a base-class
method silently overridden by two subclasses would be worse than a longer
name.

#### Returns

[`ManagerStatus`](../../BaseManager/interfaces/ManagerStatus.md)

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getManagerStatus`](../../BaseManager/classes/default.md#getmanagerstatus)

***

### getPrivateStoreAttachment()

> __getPrivateStoreAttachment__(`attachmentId`, `ctx`): `Promise`\<\{ `buffer`: `Buffer`; `metadata`: [`AttachmentMetadata`](../interfaces/AttachmentMetadata.md); \} \| `null`\>

Defined in: src/managers/AttachmentManager.ts:1389

A file from the requester's own private stores — or null when none of the
stores it can open lists it, or the PIP refuses. An encrypted store's
bytes come back decrypted; a plain store's come back as they are, and in
both cases the caller got here only by owning the container.

#### Parameters

##### attachmentId

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<\{ `buffer`: `Buffer`; `metadata`: [`AttachmentMetadata`](../interfaces/AttachmentMetadata.md); \} \| `null`\>

***

### getPrivateStoreAttachments()

> __getPrivateStoreAttachments__(`ctx`): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

Defined in: src/managers/AttachmentManager.ts:1565

Everything the requester's own private stores hold (#1460) — the half of
a browse or a list that is in no shared index. Another user's stores, and
an admin's view of anyone's, are not here: this reads `ctx`'s container
and no other.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

***

### getPrivateStoreAttachmentsForPage()

> __getPrivateStoreAttachmentsForPage__(`pageName`, `ctx`): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

Defined in: src/managers/AttachmentManager.ts:1547

The requester's own private-store files uploaded onto `pageName`.

#### Parameters

##### pageName

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

***

### getSharedPoolAttachmentByFilename()

> __getSharedPoolAttachmentByFilename__(`filename`): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md) \| `null`\>

Defined in: src/managers/AttachmentManager.ts:2415

The shared pool's record with this filename, with nothing merged (#1460).

For `AssetManager.syncPageAssets`, which keeps a SHARED index of what each
public page references: nothing private may enter it, so it must not be
given the per-requester merge [getAttachmentByFilename](#getattachmentbyfilename) does.

#### Parameters

##### filename

`string`

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md) \| `null`\>

***

### getSharedPoolAttachments()

> __getSharedPoolAttachments__(): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

Defined in: src/managers/AttachmentManager.ts:2400

The shared pool alone — what `attachment-metadata.json` holds (#1460).

For the surfaces that have no requester to merge for: an instance count,
and the CatalogSource fan-out, whose results are a shared catalogue. A
surface that DOES have one asks [getAllAttachments](#getallattachments) instead.

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

***

### getThumbnail()

> __getThumbnail__(`attachmentId`, `size`, `ctx`): `Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

Defined in: src/managers/AttachmentManager.ts:2786

Generate (or return cached) thumbnail for an image attachment.

Delegates to the provider's getThumbnail() implementation.
Returns null for non-image attachments or when the provider has no
thumbnail capability.

# 1460: a file in one of the requester's own private stores has no record
in the shared index and no bytes in the shared pool, so the provider's
cache-on-disk path cannot make its thumbnail. It is rendered from the
bytes in memory and deliberately NOT written to the shared `.thumbs`
folder: a thumbnail of a private file is the private file, smaller, and
putting one in a shared directory would undo the move this issue is.

#### Parameters

##### attachmentId

`string`

Attachment identifier

##### size

`string`

Size string e.g. "150x150"

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose reading this is (#1179). Mandatory and positional.

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

***

### getVaultShareAttachment()

> __getVaultShareAttachment__(`attachmentId`, `ctx`): `Promise`\<\{ `buffer`: `Buffer`; `metadata`: [`AttachmentMetadata`](../interfaces/AttachmentMetadata.md); \} \| `null`\>

Defined in: src/managers/AttachmentManager.ts:1418

A file served through a vault link (#1388): from the one vault the link
names, and only when a current page the link covers uses it. A file no
covered page uses — including a copy nobody uses any more (#1517) — is
not shared. `ctx` is the link's subject; the container rule and the share
ceiling decide as for every other door.

#### Parameters

##### attachmentId

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<\{ `buffer`: `Buffer`; `metadata`: [`AttachmentMetadata`](../interfaces/AttachmentMetadata.md); \} \| `null`\>

***

### heldFileIds()

> __heldFileIds__(): `Promise`\<`Set`\<`string`\>\>

Defined in: src/managers/AttachmentManager.ts:931

The ids files in the site's stores hold now, read once, for a takeout
import to pass as `PutOptions.heldIds` to each file it puts (#2188).
Ids only, from the names of the bytes on disk; no store is opened.

#### Returns

`Promise`\<`Set`\<`string`\>\>

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/AttachmentManager.ts:376

Initialize AttachmentManager and load the configured provider

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object (unused, reads from ConfigurationManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available or provider fails to load

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`initialize`](../../BaseManager/classes/default.md#initialize)

***

### invalidateHandlerCache()

> `protected` __invalidateHandlerCache__(`pageUuid`): `void`

Defined in: src/managers/BaseManager.ts:463

A page's data changed outside savePage: its cached content goes, and every cached render re-renders (#1751).

#### Parameters

##### pageUuid

`string`

#### Returns

`void`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`invalidateHandlerCache`](../../BaseManager/classes/default.md#invalidatehandlercache)

***

### isInitialized()

> __isInitialized__(): `boolean`

Defined in: src/managers/BaseManager.ts:446

Check if manager has been initialized

#### Returns

`boolean`

True if manager is initialized

#### Example

```ts
if (manager.isInitialized()) {
  // Safe to use manager
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`isInitialized`](../../BaseManager/classes/default.md#isinitialized)

***

### isOwnPrivateStoreFile()

> __isOwnPrivateStoreFile__(`attachmentId`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/AttachmentManager.ts:1521

Is `attachmentId` a file in one of the requester's own private stores?
An index read, no bytes — for a caller that has to treat a private file
differently without reading it twice (#1460).

#### Parameters

##### attachmentId

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`boolean`\>

***

### list()

> __list__(`query`): `Promise`\<[`CatalogPage`](../../../types/Schema/interfaces/CatalogPage.md)\>

Defined in: src/managers/AttachmentManager.ts:455

CatalogSource.list — query attachments and emit CreativeWork shapes.

Routes `query.text` through the provider's `getAttachmentsForPage` /
`getAllAttachments` surface, applies the (DigitalDocument-restricted)
`types` filter, and converts each match via the provider's
`toCreativeWork()`. Cursor pagination not yet implemented (initial
slice); `limit` caps page size.

#### Parameters

##### query

[`CatalogQuery`](../../../types/Schema/interfaces/CatalogQuery.md)

#### Returns

`Promise`\<[`CatalogPage`](../../../types/Schema/interfaces/CatalogPage.md)\>

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`list`](../../../types/Schema/interfaces/CatalogSource.md#list)

***

### listOwnUnusedVaultFiles()

> __listOwnUnusedVaultFiles__(`ctx`): `Promise`\<`object`[]\>

Defined in: src/managers/AttachmentManager.ts:1481

The files in the requester's own vaults that no page in that vault uses
(#1517) — for their profile page, so a copy kept for a page that left the vault,
or a file whose page was deleted, can be seen and removed.

Only the requester's own vaults, through the container rule. "Used" is a
current page of that vault in the file's mentions, which every save keeps
in step. An encrypted vault this session cannot open is reported as
locked rather than as empty.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`object`[]\>

One entry per vault with unused files, or locked; `canDelete` is
  whether this context may delete files there — the delete's own question
  (#1539), so the page offers the button exactly when the delete would work

***

### localizeRemoteImages()

> __localizeRemoteImages__(`content`, `pageName`, `ctx`, `dryRun`): `Promise`\<\{ `content`: `string`; `warnings`: `string`[]; \}\>

Defined in: src/managers/AttachmentManager.ts:644

Localize the remote images an NCM body embeds (#728 S5a-ii, #1486): each
remote `<img>`/`![](url)` is fetched, checked (size, type, ad deny-list)
and stored as an attachment of `pageName`, and the body is rewritten to
point at it. With `dryRun` nothing is stored: the fetch and checks run,
and the result reports what would be attached.

Reached through PageManager.completeNcmConversion, the NCM door, never
from a route.

# 1133: the URL comes from page content, so this fetch is a capability the
editor does not otherwise have — making the server issue a request from
inside the network. guardedFetch judges the address actually resolved, on
every redirect hop.

#### Parameters

##### content

`string`

##### pageName

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### dryRun

`boolean`

#### Returns

`Promise`\<\{ `content`: `string`; `warnings`: `string`[]; \}\>

***

### markDegraded()

> `protected` __markDegraded__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:540

Record that this manager is configured, wanted, and not working.

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

true when this is a TRANSITION — a state or reason that differs
  from the current one. Only a transition is an event: a manager that
  starts degraded and stays degraded must not re-emit on every boot, or
  the signal is buried in its own noise.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markDegraded`](../../BaseManager/classes/default.md#markdegraded)

***

### markDisabled()

> `protected` __markDisabled__(`reason`): `boolean`

Defined in: src/managers/BaseManager.ts:555

Record that this manager is deliberately off. Not a problem (#1155).

#### Parameters

##### reason

`string`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markDisabled`](../../BaseManager/classes/default.md#markdisabled)

***

### markFailed()

> `protected` __markFailed__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:560

Record that this manager could not initialise at all (#1155).

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markFailed`](../../BaseManager/classes/default.md#markfailed)

***

### markNeedsAttention()

> `protected` __markNeedsAttention__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:550

Record that this manager works, but an administrator has something to do
(#1946). Still `degraded` — it stays on the dashboard, is audited, and
clears with `markReadyIfDegradedBy` — but shown as needing attention, not
as down.

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markNeedsAttention`](../../BaseManager/classes/default.md#markneedsattention)

***

### markReady()

> `protected` __markReady__(): `boolean`

Defined in: src/managers/BaseManager.ts:571

Record that this manager is working.

Clears the reason rather than leaving a stale one behind — a recovered
manager still carrying "the directory is not writable" is a worse lie than
no reason at all.

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markReady`](../../BaseManager/classes/default.md#markready)

***

### markReadyIfDegradedBy()

> `protected` __markReadyIfDegradedBy__(`reason`): `boolean`

Defined in: src/managers/BaseManager.ts:580

Record that this manager is working again, but only while it is still
degraded for `reason` — the one a check set, now cleared by re-running
it (#1842). A different fault set since stays reported.

#### Parameters

##### reason

`string`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markReadyIfDegradedBy`](../../BaseManager/classes/default.md#markreadyifdegradedby)

***

### mayInVault()

> __mayInVault__(`ctx`, `permission`, `owner`, `store`, `what`): `Promise`\<`boolean`\>

Defined in: src/managers/AttachmentManager.ts:1362

May `ctx` do `permission` to `what` in `owner`'s vault `store` (#1539)?
The container rule, then the capability asked with the vault, so
`vault-owner` decides — the same rule as a vault page. FileManager's
write door asks it for a vault (#2148), so the rule has one home.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### permission

`string`

##### owner

`string`

##### store

`string`

##### what

`string`

#### Returns

`Promise`\<`boolean`\>

***

### mayReadAttachment()

> __mayReadAttachment__(`attachmentId`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/AttachmentManager.ts:1213

May `ctx` read this file, by the rules `GET /attachments/:id` serves it
under: a file in the requester's own store, else `asset-read`, and a
private file only to its owner or their delegate (PIP). No bytes are read.

#### Parameters

##### attachmentId

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`boolean`\>

***

### migratePrivateFilesAtBoot()

> __migratePrivateFilesAtBoot__(): `Promise`\<`void`\>

Defined in: src/managers/AttachmentManager.ts:1671

Move every unencrypted private file record out of the global
`attachment-metadata.json` and into its store's own index, at start-up.

Best-effort: a failure is logged and never blocks start-up, the shape
`migratePrivateLinksAtBoot` uses.

#### Returns

`Promise`\<`void`\>

***

### migratePrivateFilesIntoStores()

> __migratePrivateFilesIntoStores__(`ctx`): `Promise`\<`number`\>

Defined in: src/managers/AttachmentManager.ts:1711

Move the private file records still in the shared index into their stores.

__Which files are private__ is decided from the record itself first — the
`isPrivate` / `creator` / `store` fields #1398 writes — and, where that is
not enough, from the page it is attached to: a mention naming
`private/{owner}/{store}/{title}` says whose store the file belongs in,
confirmed through `PageManager.getPrivatePageOwner`. A record that is
neither is a public attachment and stays where it is.

__What moves__: the bytes, into `{store}/attachments/`, KEEPING their
existing file name — nothing on disk is renamed — and the record, into
the store's own index under the id it already had, because that id is its
`/attachments/{id}` URL on every page that references it.

__No unlock split__, unlike #1457's link migration and #1458's search
indexes. Those needed one because a page's TEXT is sealed; here an
unencrypted store needs no key at all, so this boot job finishes the whole
job for the stores it is about. A record pointing at an ENCRYPTED store is
skipped, with a line saying so: #1400 already keeps those files in their
store, and one predating it cannot be re-sealed without its owner's DEK.

__Idempotent__: a second run finds nothing left in the shared index, and a
record whose store already lists the id moves no bytes.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose reading and writing this is (#1179). Mandatory and positional.

#### Returns

`Promise`\<`number`\>

how many records moved

***

### movePageAttachments()

> __movePageAttachments__(`previousName`, `name`, `content`, `ctx`): `Promise`\<`number`\>

Defined in: src/managers/AttachmentManager.ts:1784

Move the files a page uses when the page changes place — into a vault, out
of one, or between two — so that every file a vault page uses is in that
vault (operator, 2026-10-16). Called by the page door after the page moved.

__Which files__: those whose mentions name the page where it was, and
those its content references (`[{Image src='…'}]`, `[{ATTACH src='…'}]`,
`/attachments/{id}`), resolved in the vault it left first, then the shared
pool.

__How__: each file is copied to the destination under the same id (its
`/attachments/{id}` URL in the page), through both sides' store I/O —
sealed going into a sealed vault, opened coming out. Then the source: a
file no other page there uses is removed; one another page still uses is
left for it, without this page's mention. A shared-pool file is removed
from the pool only when no public page that exists now is among its
mentions (poolFileShare): a file other public pages use is copied
in, never taken from them, and a stale mention (a page renamed, made
private or deleted, often this page's own former title) keeps nothing.

__Refusal__: both sides' I/O is resolved before any file moves, so a locked
vault, or a sealed kind's vault not yet opened, moves nothing — the same
refusal the page's own save meets first.

#### Parameters

##### previousName

`string`

The page's name before: a public title, or `vaults/{owner}/{store}/{title}`

##### name

`string`

Its name now

##### content

`string`

Its content

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose move this is (#1179): the page door already let it move the page

#### Returns

`Promise`\<`number`\>

how many files moved or were copied

***

### movePoolFilesIntoVault()

> __movePoolFilesIntoVault__(`name`, `content`, `ctx`, `opts?`): `Promise`\<\{ `copied`: `number`; `moved`: `number`; \}\>

Defined in: src/managers/AttachmentManager.ts:2016

Bring the shared-pool files vault page `name` still uses into its vault
(#1842's repair, for files a move before #1842 left in the pool): the
files its mentions name and those `content` references that the vault
doesn't hold, each by [movePageAttachments](#movepageattachments)'s rule — copied in under
the same id, sealed when the vault is, and removed from the pool only
when no public page that exists now uses it (poolFileShare).
A file the vault already holds under the same id whose pool copy no
public page uses loses that copy too, so running the repair again on a
page whose files were copied in removes what was left behind.

The vault's I/O is resolved first, so a locked vault, or a sealed kind's
vault not yet opened, throws and nothing moves. Who may ask is the
caller's (`PageManager.repairVaultPage`) to decide.

#### Parameters

##### name

`string`

The page's vault name, `vaults/{owner}/{store}/{title}`

##### content

`string`

Its content; '' when only its mentions are to be followed

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose I/O this is: the owner's session for a sealed vault

##### opts?

###### dryRun?

`boolean`

Count what would happen, and change nothing

#### Returns

`Promise`\<\{ `copied`: `number`; `moved`: `number`; \}\>

how many files were (or would be) moved out of the pool, and copied with a pool copy left for other pages

***

### noteOwnStoreRenumbered()

> __noteOwnStoreRenumbered__(`ctx`, `store`, `pairs`): `Promise`\<`void`\>

Defined in: src/managers/AttachmentManager.ts:949

Adds `pairs` to [ownStoreRenumbered](#ownstorerenumbered)'s, for a run that stored files under new ids (#2188).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### store

`string`

##### pairs

`ReadonlyMap`\<`string`, `string`\>

#### Returns

`Promise`\<`void`\>

***

### ownStoreFingerprints()

> __ownStoreFingerprints__(`ctx`, `store`): `Promise`\<`Map`\<`string`, `string`\> \| `null`\>

Defined in: src/managers/AttachmentManager.ts:1533

The files the requester's own store `store` holds, as fingerprint → id,
or null when this context cannot open it (#2171). The store's own
duplicate check (its index's fingerprints), read without storing or
recording anything: a takeout import reads it once per run and asks it
before putting a file again, so a file deleted since comes back and one
still held writes no second upload record. Only that store is opened.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### store

`string`

#### Returns

`Promise`\<`Map`\<`string`, `string`\> \| `null`\>

***

### ownStoreRenumbered()

> __ownStoreRenumbered__(`ctx`, `store`): `Promise`\<`Map`\<`string`, `string`\> \| `null`\>

Defined in: src/managers/AttachmentManager.ts:943

The ids a takeout import gave the files of `ctx`'s own store `store` that
could not keep their own, as takeout id → id here (#2188), or null when
this context cannot open the store. Ids only.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### store

`string`

#### Returns

`Promise`\<`Map`\<`string`, `string`\> \| `null`\>

***

### poolFilesOfVaultPage()

> __poolFilesOfVaultPage__(`name`, `content`, `ctx`): `Promise`\<`object`[]\>

Defined in: src/managers/AttachmentManager.ts:2053

The shared-pool files [movePoolFilesIntoVault](#movepoolfilesintovault) would bring into
vault page `name`'s vault, by id with their file name and the URL that
serves them today (#1842's repair list, for the owner to check what will
move). Changes nothing and logs nothing. The vault's I/O is resolved as
for the move, so a locked vault throws. Whether `ctx` may see these is the
caller's (`PageManager.vaultRepairDetails`) to decide: names are shown to
the page's reader only, never logged or recorded.

#### Parameters

##### name

`string`

##### content

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`object`[]\>

***

### poolMentionedVaultPages()

> __poolMentionedVaultPages__(`owner`, `store`): `Promise`\<`string`[]\>

Defined in: src/managers/AttachmentManager.ts:2120

The vault page names in `owner`'s vault `store` that shared-pool records
still mention (#1842), and, in a vault that is not sealed, those its own
files name whose pool copy should be gone (heldPoolLeftovers):
what the startup check reports as "pages named by shared records". Used
by the repair; never logged.

#### Parameters

##### owner

`string`

##### store

`string`

#### Returns

`Promise`\<`string`[]\>

***

### preflightConfiguredPath()

> `protected` __preflightConfiguredPath__(`configKey`, `path`, `options?`): [`PathPreflightResult`](../../../utils/PathPreflight/interfaces/PathPreflightResult.md)

Defined in: src/managers/BaseManager.ts:495

Preflight a configured filesystem path before any mkdir/write happens.

Wraps `checkConfiguredPath()` with a standardized warning log that names
the manager (`this.constructor.name`) and the originating config key.
Useful for paths that may live on volumes the OS has unmounted (notably
macOS `/Volumes/<X>/...`), where `fs.ensureDir` would otherwise crash
the engine with an opaque `EACCES`.

The caller decides what to do on failure (degrade, fall back to a
default, or treat as fatal).

#### Parameters

##### configKey

`string`

The config key that supplied this path — included in
                  the warning so operators know what to fix.

##### path

`string` \| `null` \| `undefined`

The resolved path to check.

##### options?

[`PathPreflightOptions`](../../../utils/PathPreflight/interfaces/PathPreflightOptions.md) = `{}`

#### Returns

[`PathPreflightResult`](../../../utils/PathPreflight/interfaces/PathPreflightResult.md)

The preflight result. `result.ok === true` means safe
                  to proceed.

#### Example

```ts
const preflight = this.preflightConfiguredPath(
  'ngdpbase.backup.directory',
  this.backupDirectory
);
if (!preflight.ok) {
  // degrade — disable feature, fall back to default, etc.
  return;
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`preflightConfiguredPath`](../../BaseManager/classes/default.md#preflightconfiguredpath)

***

### quarantineOrphans()

> __quarantineOrphans__(`options`, `ctx`): `Promise`\<\{ `dryRun`: `boolean`; `manifestPath`: `string` \| `null`; `orphansSelected`: `object`[]; `quarantined`: `number`; `recordlessSelected`: `string`[]; `skipped`: `number`; \}\>

Defined in: src/managers/AttachmentManager.ts:3071

# 865 Slice 3: guarded orphan cleanup — quarantine, never hard-delete.

Recomputes the health report FRESH (never trusts a client-supplied list),
then moves verified orphan records (+ their files) and recordless disk
files into `<storage>/quarantine/`. Removed records are appended to a
per-run manifest in the quarantine dir so the operation is reversible.
`dryRun: true` returns exactly what WOULD move, touching nothing.

# 1460: only the SHARED POOL's orphans are selected. The quarantine folder
is a shared directory, so moving a private-store file into it would carry
it out of its store and put its name back in shared storage — the exact
move this issue undoes. A store's own files are its owner's to delete,
through `deleteAttachment`.

#### Parameters

##### options

###### dryRun

`boolean`

###### includeOrphans

`boolean`

###### includeRecordless

`boolean`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose run this is (#1179). Mandatory and positional.

#### Returns

`Promise`\<\{ `dryRun`: `boolean`; `manifestPath`: `string` \| `null`; `orphansSelected`: `object`[]; `quarantined`: `number`; `recordlessSelected`: `string`[]; `skipped`: `number`; \}\>

***

### readableVaultAssetRecords()

> __readableVaultAssetRecords__(`ctx`, `query?`): `Promise`\<`object`[]\>

Defined in: src/managers/AttachmentManager.ts:1595

[searchPrivateStoreAttachments](#searchprivatestoreattachments), kept apart by vault (#1852): the
files layer needs to say which vault each file is in. The same stores,
the same container rule, the same matching.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### query?

[`AssetQuery`](../../../types/Asset/interfaces/AssetQuery.md) = `{}`

#### Returns

`Promise`\<`object`[]\>

***

### readAttachmentFor()

> __readAttachmentFor__(`attachmentId`, `ctx`): `Promise`\<\{ `buffer`: `Buffer`; `metadata`: [`AttachmentMetadata`](../interfaces/AttachmentMetadata.md); \} \| `null`\>

Defined in: src/managers/AttachmentManager.ts:1223

A file's original bytes and metadata, when [mayReadAttachment](#mayreadattachment) lets `ctx` read it; else null.

#### Parameters

##### attachmentId

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<\{ `buffer`: `Buffer`; `metadata`: [`AttachmentMetadata`](../interfaces/AttachmentMetadata.md); \} \| `null`\>

***

### rebuild()

> __rebuild__(`opts?`): `Promise`\<`void`\>

Defined in: src/managers/AttachmentManager.ts:538

CatalogSource.rebuild — re-extract embedded document metadata on every
stored attachment. Walks the entire metadata store, for each
doc-MIME attachment re-runs exiftool extraction on the stored file and
backfills the seven Slice-5 fields (documentTitle / documentAuthor /
documentSubject / documentKeywords / documentDateCreated /
documentDateModified / inLanguage). Backfills pre-v3.27.0 records that
never went through the Slice-5 extraction path at upload time.

Per-file failures are non-fatal — logged and counted. Non-document
MIMEs are skipped. Wired into the `attachments.rebuild` background job
for operator-triggered runs from the admin dashboard. Slice 5b of #760
(#763).

#### Parameters

##### opts?

[`RebuildOpts`](../../../types/Schema/interfaces/RebuildOpts.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`rebuild`](../../../types/Schema/interfaces/CatalogSource.md#rebuild)

***

### recheckVaultPagesUsingPoolFiles()

> __recheckVaultPagesUsingPoolFiles__(): `Promise`\<[`VaultPagePoolFiles`](../interfaces/VaultPagePoolFiles.md)[]\>

Defined in: src/managers/AttachmentManager.ts:2271

Run that check again (#1842): after a repair, so the subsystem banner
clears once nothing is left. No notification.

#### Returns

`Promise`\<[`VaultPagePoolFiles`](../interfaces/VaultPagePoolFiles.md)[]\>

***

### refreshAttachmentList()

> __refreshAttachmentList__(): `Promise`\<`void`\>

Defined in: src/managers/AttachmentManager.ts:3118

Refresh attachment list (rescan storage)

#### Returns

`Promise`\<`void`\>

***

### reportVaultPagesUsingPoolFilesAtBoot()

> __reportVaultPagesUsingPoolFilesAtBoot__(): `Promise`\<`void`\>

Defined in: src/managers/AttachmentManager.ts:2263

The startup report for [findVaultPagesUsingPoolFiles](#findvaultpagesusingpoolfiles), made the way
the unsealed-vault and notes checks report (#1834, #1839): an error in the
log naming each owner, vault and page uuid, the degraded state (the
subsystem banner) and a system notification. Nothing is moved or deleted.
A failing check is logged, never thrown. Run after the boot migration, so
what it moved into plain stores is not reported.

#### Returns

`Promise`\<`void`\>

***

### resolveAttachmentSrc()

> __resolveAttachmentSrc__(`src`, `pageName`, `ctx`): `Promise`\<\{ `mimeType`: `string`; `url`: `string`; \} \| `null`\>

Defined in: src/managers/AttachmentManager.ts:2650

Resolve an attachment src value (from plugin syntax) to a serving URL and MIME type.

This is the canonical resolution method used by all plugins (ImagePlugin,
AttachPlugin, and future media plugins). Centralising here means Media
Manager (#273), private folders (#122), and any other media source only
need to be wired in once.

Resolution order:
  0. media:// URI — resolved via MediaManager.findByFilename(); never touches attachment store

  1. External URL (starts with http:// or https://) — returned as-is, mimeType: ''
  2. Absolute path (starts with /) — returned as-is, mimeType: ''
  3. Filename lookup on the current page's attachments (exact name match)
  4. Global filename search across all attachments
  5. Returns null if unresolvable (caller decides how to render the error)

#### Parameters

##### src

`string`

The raw src value from plugin syntax

##### pageName

`string`

Page name for step 3 context

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<\{ `mimeType`: `string`; `url`: `string`; \} \| `null`\>

Resolved result or null

***

### restore()

> __restore__(`backupData`, `options?`): `Promise`\<`void`\>

Defined in: src/managers/AttachmentManager.ts:3174

Restore manager data from backup
Delegates to provider's restore method

#### Parameters

##### backupData

[`AttachmentBackupData`](../interfaces/AttachmentBackupData.md)

Backup data from backup() method

##### options?

[`ManagerRestoreOptions`](../../BaseManager/interfaces/ManagerRestoreOptions.md)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

***

### restoreIsStaged()

> __restoreIsStaged__(): `boolean`

Defined in: src/managers/AttachmentManager.ts:3211

Its restore is staged for the next start with the rest of a site restore (#1876).

#### Returns

`boolean`

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`restoreIsStaged`](../../BaseManager/classes/default.md#restoreisstaged)

***

### safeGetManagerStats()

> __safeGetManagerStats__(): `Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/BaseManager.ts:819

`getManagerStats()` that cannot break the page it is rendered on.

The contract says an override must not throw, and saying so does not make
it true — an override reads a store, and a store can fail. This is what an
admin surface iterating every manager should call: one manager throwing
becomes one unhealthy row rather than a 500 for all of them.

#### Returns

`Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`safeGetManagerStats`](../../BaseManager/classes/default.md#safegetmanagerstats)

***

### searchPrivateStoreAttachments()

> __searchPrivateStoreAttachments__(`query`, `ctx`): `Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md)[]\>

Defined in: src/managers/AttachmentManager.ts:1586

The requester's own private-store files as asset-search results (#1460).

AssetManager fans a search out over the provider registry, and no provider
can see a store it was given no context for — so the store half is merged
by the one caller that holds the requester's context. The matching rules
are the provider's own, applied to the store's entries, so a private file
is findable exactly as a public one is.

#### Parameters

##### query

[`AssetQuery`](../../../types/Asset/interfaces/AssetQuery.md)

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md)[]\>

***

### sharedPoolAssetRecords()

> __sharedPoolAssetRecords__(): `Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md)[]\>

Defined in: src/managers/AttachmentManager.ts:1614

The shared pool as asset records (#1852), every one of them: the
provider's own mapping, so the files layer and asset search show a
public file the same way. Whether the requester may read the pool is the
caller's question (`asset-read`).

#### Returns

`Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md)[]\>

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/AttachmentManager.ts:3219

Shutdown the manager

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`shutdown`](../../BaseManager/classes/default.md#shutdown)

***

### stagedRestoreAtStart()

> `protected` __stagedRestoreAtStart__(): [`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/managers/BaseManager.ts:398

What this start did with a staged restore of this manager's declared parts (#1985): null when there was none.

#### Returns

[`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`stagedRestoreAtStart`](../../BaseManager/classes/default.md#stagedrestoreatstart)

***

### storeInPlace()

> __storeInPlace__(`ctx`, `place`, `file`, `options?`): `Promise`\<[`StoredInPlace`](../interfaces/StoredInPlace.md)\>

Defined in: src/managers/AttachmentManager.ts:743

Store a file in `place` (#2148): the storage underneath FileManager's
door. Only `FileManager.put` calls this, after it has asked the
permission for the place; nothing here decides where a file goes or who
may put it there.

What it does, as the place requires: the type read from the bytes
(#1624); the uploader recorded by identity @id, and nobody uploads
anonymously (#1926, #2097); a vault or shared folder keeps the file in its
own store, sealed when the store is (#1460, #1394); and an import's kept
original honoured only in its user's own vault (#2061). It records
nothing (#2149): it returns what the upload's audit record says (a sealed
store's file by id only, #2048), and FileManager, the owner, records it.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### place

[`FilePlace`](../../../types/File/type-aliases/FilePlace.md)

##### file

[`PutFile`](../interfaces/PutFile.md)

##### options?

[`PutOptions`](../interfaces/PutOptions.md) = `{}`

#### Returns

`Promise`\<[`StoredInPlace`](../interfaces/StoredInPlace.md)\>

***

### syncPageMentions()

> __syncPageMentions__(`pageName`, `content`, `ctx`): `Promise`\<`void`\>

Defined in: src/managers/AttachmentManager.ts:2867

#### Parameters

##### pageName

`string`

##### content

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose save this is (#1179). Mandatory and positional: the
  requester's own private-store files take part in this too (#1460) —
  a file uploaded into their store from a public page's editor is
  mentioned by that page, and its mentions live in its store's own index.

#### Returns

`Promise`\<`void`\>

***

### toFormOptions()

> __toFormOptions__(`_options?`, `_viewer?`): `Promise`\<[`FormOption`](../../../utils/pluginFormatters/interfaces/FormOption.md)[]\>

Defined in: src/managers/BaseManager.ts:758

Return the choices for a form dropdown, for the forms add-on's
`"optionsSource": "fetch:ManagerName.toFormOptions(list=funds)"`.

The same convention and the same safety rules as `toMarqueeText()`: it is
the one other method page content may reach (`resolveManagerOptions`), it
runs on every render for every viewer, and it must have no side effect.
Offer only what `_viewer` may see. The forms add-on calls it again when the
form is submitted and refuses a value that is not among the choices.

#### Parameters

##### \_options?

`Record`\<`string`, `string`\> = `{}`

Parsed args from the spec, as raw `{ key: value }` strings.

##### \_viewer?

`unknown`

The viewer's context.

#### Returns

`Promise`\<[`FormOption`](../../../utils/pluginFormatters/interfaces/FormOption.md)[]\>

`{ value, label }` choices (plain strings are accepted too), or `[]`.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`toFormOptions`](../../BaseManager/classes/default.md#toformoptions)

***

### toMarqueeText()

> __toMarqueeText__(`_options?`, `_viewer?`): `Promise`\<`string`\>

Defined in: src/managers/BaseManager.ts:740

Return a plain-text string suitable for use as MarqueePlugin banner text.

Override in subclasses to expose live manager data as a scrolling banner:

  [{MarqueePlugin fetch='PageManager.toMarqueeText()'}]
  [{MarqueePlugin fetch='PageManager.toMarqueeText(limit=5,sort=date-desc)'}]

The default returns '' (no output). Subclasses should return a concise,
single-line summary. Common options (limit, sortBy, sortOrder, since, before)
are available via ManagerFetchOptions; domain-specific keys are read directly
from the raw options object passed by the caller.

#### Parameters

##### \_options?

[`ManagerFetchOptions`](../../../utils/managerUtils/interfaces/ManagerFetchOptions.md) = `{}`

Parsed fetch args from the plugin invocation.

##### \_viewer?

`unknown`

The viewer's context (#1556): show only what they may see.
                 Page text reaches this method, and only this method, on
                 every render for every viewer.

#### Returns

`Promise`\<`string`\>

Plain text, or '' if this manager has nothing to display.

#### Example

```ts
async toMarqueeText(options: ManagerFetchOptions = {}): Promise<string> {
  const pages = await this.getRecentChanges(options.limit ?? 5);
  return 'Recent: ' + pages.map(p => p.name).join('  •  ');
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`toMarqueeText`](../../BaseManager/classes/default.md#tomarqueetext)

***

### updateAssetMetadata()

> __updateAssetMetadata__(`attachmentId`, `patch`, `context`): `Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md) \| `null`\>

Defined in: src/managers/AttachmentManager.ts:2574

Edit an attachment's descriptive metadata (#999).

Distinct from `updateAttachmentMetadata`, which takes an
`AttachmentMetadata` shape and returns a boolean. This takes the same
`AssetMetadataPatch` the media route uses — absent means keep, explicit
`null` means clear — and returns the refreshed record.

__Sidecar only for attachments.__ Unlike the media equivalent, this does
not write into the file: attachment IDs are content hashes, so an embedded
write would break the id↔bytes invariant. See
`BasicAttachmentProvider.updateMetadata` for the full reasoning.

Gated on `asset-edit`, the same permission `PATCH /media/api/item/:id`
uses — this is asset metadata editing, and it should not require a
*different* right depending on whether the file happens to be a page
attachment or a media-library item.

Note the older `updateAttachmentMetadata` still gates on
`asset-upload`. Two paths edit attachment metadata under two different
permissions; that divergence predates this method and is left alone rather
than changed as a side effect of adding a route.

#### Parameters

##### attachmentId

`string`

Attachment identifier

##### patch

[`AssetMetadataPatch`](../../../types/Asset/interfaces/AssetMetadataPatch.md)

Fields to change; `null` clears, omission leaves alone

##### context

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Caller, for the permission check

#### Returns

`Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md) \| `null`\>

The refreshed record, or null when the attachment is unknown

#### Throws

Error when the caller lacks `asset-edit`, or the provider cannot edit

***

### updateAttachmentMetadata()

> __updateAttachmentMetadata__(`attachmentId`, `updates`, `context`): `Promise`\<`boolean`\>

Defined in: src/managers/AttachmentManager.ts:2518

Update attachment metadata

#### Parameters

##### attachmentId

`string`

Attachment identifier

##### updates

`Partial`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)\>

Metadata updates

##### context

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is acting (#1179): the request's subject, or a JobContext

#### Returns

`Promise`\<`boolean`\>

Success status

***

### uploadAttachment()

> __uploadAttachment__(`fileBuffer`, `fileInfo`, `ctx`, `options?`): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)\>

Defined in: src/managers/AttachmentManager.ts:714

Upload a file onto a page: the page-tied path its current callers use
(the editor's upload route, imports, NCM image localization, thumbnails).

# 2148: this decides nothing. Where the file goes is FileManager's
(`placeForPageUpload`, kept until #2149/#2150 move these callers to a
place the user chose), and the write is FileManager's one door, `put`,
which asks the permission for that place and then has this manager store
it ([storeInPlace](#storeinplace)). One write path, not two.

#### Parameters

##### fileBuffer

`Buffer`

File data

##### fileInfo

[`FileInfo`](../interfaces/FileInfo.md)

{ originalName, mimeType, size }

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is uploading (#1179): the request's subject, or a JobContext for an in-engine caller. Mandatory and positional.

##### options?

[`UploadOptions`](../interfaces/UploadOptions.md) = `{}`

The page it is uploaded onto, the private tick and store, description, keep, importedFrom

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)\>

Attachment metadata

***

### vaultFileInventory()

> __vaultFileInventory__(): `Promise`\<`object`[]\>

Defined in: src/managers/AttachmentManager.ts:1628

Every vault's files, for an operator inventory with no viewer (#1852,
the files migration dry run), the way [findVaultPagesUsingPoolFiles](#findvaultpagesusingpoolfiles)
walks them: an unsealed vault's index entries; for any other vault
(sealed, or not yet opened) only the files on disk and their size, since
its index can't be read without its owner's key. Reads only. The entries
are for the files layer to count; they are never shown.

#### Returns

`Promise`\<`object`[]\>

***

### vaultPagesUsingPoolFiles()

> __vaultPagesUsingPoolFiles__(): [`VaultPagePoolFiles`](../interfaces/VaultPagePoolFiles.md)[]

Defined in: src/managers/AttachmentManager.ts:2276

What the last check found (#1842): owner, vault, page uuid (null: pages named by shared records), file count.

#### Returns

[`VaultPagePoolFiles`](../interfaces/VaultPagePoolFiles.md)[]
