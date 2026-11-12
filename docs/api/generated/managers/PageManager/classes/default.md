[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / default

# Class: default

Defined in: src/managers/PageManager.ts:618

PageManager - Manages wiki page operations through a pluggable provider system

Follows JSPWiki's provider pattern where the actual storage implementation
is abstracted behind a provider interface. This allows for different storage
backends (filesystem, database, cloud, etc.) to be swapped via configuration.

The PageManager acts as a thin coordinator that:

- Loads the configured provider (via "ngdpbase.page.provider")
- Proxies all page operations to the provider
- Maintains the public API for backward compatibility

 PageManager

## See

- [BaseManager](../../BaseManager/classes/default.md) for base functionality
- FileSystemProvider for default provider implementation

## Example

```ts
const pageManager = engine.getManager('PageManager');
const page = await pageManager.getPage('Main');
console.log(page.content);
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Implements

- [`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md)

## Constructors

### Constructor

> __new default__(`engine`): `PageManager`

Defined in: src/managers/PageManager.ts:674

Creates a new PageManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`PageManager`

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

Defined in: src/managers/PageManager.ts:650

On-disk schema version for the page-frontmatter shape (Decision 6).
Bump when the persisted Article-relevant fields on a page change. v1 is
the post-#754 (v3.33.0) shape, which adds the required `created`
timestamp to every page.

***

### currentSchemaVersion

> `readonly` __currentSchemaVersion__: `1` = `PageManager.CURRENT_SCHEMA_VERSION`

Defined in: src/managers/PageManager.ts:651

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

> `readonly` __sourceId__: `"pages"` = `'pages'`

Defined in: src/managers/PageManager.ts:620

CatalogSource identifier (Slice 4 of #755 / #772).

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`sourceId`](../../../types/Schema/interfaces/CatalogSource.md#sourceid)

***

### types

> `readonly` __types__: readonly [`SchemaType`](../../../types/Schema/type-aliases/SchemaType.md)[]

Defined in: src/managers/PageManager.ts:628

Subtypes this source produces. Pages always map to Article (Decision 1).
Very-sparse pre-#754 pages still produce Article — `dateCreated` is the
only Article-distinctive field and it's now mandatory after the
# 754 backfill (v3.33.0).

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`types`](../../../types/Schema/interfaces/CatalogSource.md#types)

## Methods

### addonPagesSource()

> __addonPagesSource__(`addonName`, `pagesDir`): [`ShippedPageSource`](../interfaces/ShippedPageSource.md)

Defined in: src/managers/PageManager.ts:1333

The source for the pages an addon ships (#1406). Pages it writes carry
`addon`, the add-on as author (`addon:<slug>`, #2255) and, when the source
names none, the `addon` category (#931).

#### Parameters

##### addonName

`string`

The addon's name

##### pagesDir

`string`

The addon's `pages/` folder

#### Returns

[`ShippedPageSource`](../interfaces/ShippedPageSource.md)

***

### adoptUserPageCatalog()

> __adoptUserPageCatalog__(`ctx`): `Promise`\<`number`\>

Defined in: src/managers/PageManager.ts:4425

At unlock (#1456): the owner's sealed pages move from their user-level
catalog into each encrypted store's own page index. Idempotent.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

The owner's context, holding the unlocked store keys

#### Returns

`Promise`\<`number`\>

***

### allowShippedPage()

> __allowShippedPage__(`sourceId`, `uuid`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/PageManager.ts:1168

Undo a decline (#1412), so the page is offered again at the next start-up
or Sync.

#### Parameters

##### sourceId

`string`

`required-pages`, or `addon:<name>`

##### uuid

`string`

The shipped page's uuid

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who decided

#### Returns

`Promise`\<`boolean`\>

True when there was a decline to undo

***

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/PageManager.ts:5486

Backup all pages through the provider

Delegates to the provider's backup() method to serialize all page data.
The backup includes all page content, metadata, and directory structure.

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Backup data from provider

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

### buildMissingStoreSearchIndexes()

> __buildMissingStoreSearchIndexes__(`ctx`, `owner?`): `Promise`\<`number`\>

Defined in: src/managers/PageManager.ts:3877

Give every readable store that has no search index one, built from its
pages (#1458).

A store with an index is left alone, so this is cheap at every boot and
every unlock; a store whose index was lost gets it back. That the file is
missing IS the marker — unlike the link migration (#1457), which had to
record that it ran because its result is indistinguishable from never
having run, an absent index says plainly that one is needed.

Only the stores `ctx` can open are visited: the system principal reaches
the unencrypted ones at boot, the owner's own session reaches their sealed
ones at unlock. One store's failure never stops the others.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose reading and writing this is (#1179)

##### owner?

`string`

One user's stores, or every readable store when omitted

#### Returns

`Promise`\<`number`\>

How many stores were given an index

***

### buildOwnStoreTakeout()

> __buildOwnStoreTakeout__(`ctx`, `options`): `Promise`\<[`Takeout`](../../../utils/privateStoreExport/type-aliases/Takeout.md)\>

Defined in: src/managers/PageManager.ts:3083

A takeout of one of the requester's OWN private stores (#1387).

The door is here rather than in a route because a route should not be
working out where a store lives on disk. What comes back is decrypted and
in memory, ready to be packed and streamed; nothing is written anywhere.

Only the requester's own store: `mayActInPrivateContainer` decides, as
everywhere else, on ownership or delegation and never on a role. A store
that is encrypted and locked in this session THROWS rather than returning
an empty takeout — an archive that downloads cleanly and cannot be read is
the worst outcome available, since it is discovered long afterwards.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options

###### pagesOnly?

`boolean`

###### store

`string`

#### Returns

`Promise`\<[`Takeout`](../../../utils/privateStoreExport/type-aliases/Takeout.md)\>

***

### buildStoreSearchIndexesAtBoot()

> __buildStoreSearchIndexesAtBoot__(): `Promise`\<`void`\>

Defined in: src/managers/PageManager.ts:3911

Build the missing search indexes of the unencrypted stores, at boot.

Best-effort: a failure is logged and never blocks start-up. An encrypted
store is not readable here — it gets its index at its owner's unlock, the
same split the link migration uses (#1457).

#### Returns

`Promise`\<`void`\>

***

### checkPrivatePageAccess()

> __checkPrivatePageAccess__(`wikiContext`, `pageNameOrUuid`, `adminEntry?`): `Promise`\<`boolean` \| `null`\>

Defined in: src/managers/PageManager.ts:4333

The private-container decision for a page (docs/private-stores.md,
Access). PolicyInformationPoint's Tier 0 asks this, so every `canAccess` on a page —
view, edit, lists, the attachment door — reaches the same rule.

`pages/vaults/{user}/` and every store below it is owned by that user.
Nobody else acts in it unless the owner delegated (a share the owner
issued, once the store's Share switch exists — #1388). No role reaches in
(security-posture P2: no `hasRole` as an allow); at a door, a holder of
`admin-system` may enter an unencrypted vault when
`ngdpbase.vaults.admin-access` is on (#2255), recorded each time.

The owner is the one in the page's name (#1456), not frontmatter
`author`, so reassigning `author` cannot move ownership (#711).

Returns:

- `null`  — a public name; the caller falls through to its next tier
- `true`  — a private name, and the caller is the owner or the owner's delegate
- `false` — a private name, and the caller is neither — whether or not
              the page exists

#### Parameters

##### wikiContext

`WikiContext`

##### pageNameOrUuid

`string`

##### adminEntry?

`"record"` \| `"none"` \| `"quiet"` = `'none'`

#### Returns

`Promise`\<`boolean` \| `null`\>

***

### completeNcmConversion()

> __completeNcmConversion__(`content`, `target`, `ctx`, `options?`): `Promise`\<\{ `content`: `string`; `warnings`: `string`[]; \}\>

Defined in: src/managers/PageManager.ts:3358

The NCM door's second half (#1486): the conversion steps that write.

`convertPageToNcm` is pure — fix steps, links, tables, `ncmVersion` — so a
caller can validate and check for a stale version before anything is
written. This runs after those checks, and is the one place the funnel's
side effects happen:

- remote images become attachments of the page (AttachmentManager), when
  `localizeImages` is set — interactive Convert to NCM only, today; the
  agent and import paths leave remote images as links;
- `[^id]: text` definitions move to the page's footnote list
  (FootnoteManager), when the page has a uuid and footnotes are enabled.

Import, ingest, MCP and Convert to NCM all come through here, so they
cannot drift apart again. With `dryRun` nothing is stored: the preview
shows what apply will do.

#### Parameters

##### content

`string`

The converted page text (with or without frontmatter)

##### target

The page it belongs to: its name, and its uuid when known

###### pageName

`string`

###### uuid?

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is acting; attachments and footnotes are theirs

##### options?

`dryRun`, `localizeImages`

###### dryRun?

`boolean`

###### localizeImages?

`boolean`

#### Returns

`Promise`\<\{ `content`: `string`; `warnings`: `string`[]; \}\>

The text to save, and a warning per thing done or refused

***

### convertAuthorship()

> __convertAuthorship__(`ctx`): `Promise`\<[`AuthorshipConversion`](../interfaces/AuthorshipConversion.md) \| `null`\>

Defined in: src/managers/PageManager.ts:4590

Convert the public pages' authorship to identity

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`AuthorshipConversion`](../interfaces/AuthorshipConversion.md) \| `null`\>

#### Ids

(#2097, operator
2026-10-26), through this door's own write path, one page at a time
with the saves (pageWrite):

- each page's frontmatter `author` and `editor`, written without
  touching its body, its other fields or its `lastModified`, and without
  a new version; its page index entry follows;
- its version history's editors (`manifest.json`), in place;
- the tombstones' `author`, `editor` and `deletedBy`;
- then the search index, rebuilt from the pages once if anything changed.

Each value gets `IdentityManager.convertRecordedUser`'s answer: a
username with an account becomes its @id; one with none `orphan:<name>`
(counted, and on the dashboard: only an administrator acts on those
pages); `migrated`, `unknown` and `import` `orphan:<value>` without a
lookup (counted apart, not needing attention); @ids, orphans and
principals are kept, so a second run writes nothing.

The first complete pass visits every page and its history, and is then
recorded in the site's migrations record; later passes visit only pages
whose index entry still holds a value to convert. Pages are taken in
batches of `ngdpbase.page.authorship-conversion.batch-size`, yielding
between batches. When the identity store cannot answer (`canAnswer()`
false, or a lookup fails mid-pass) the pass stops, says so on the
dashboard, and the next start tries again. Logs counts only. Vault pages
convert when their vault is opened ([convertVaultAuthorship](#convertvaultauthorship)).

***

### convertAuthorshipAtBoot()

> __convertAuthorshipAtBoot__(): `Promise`\<[`AuthorshipConversion`](../interfaces/AuthorshipConversion.md) \| `null`\>

Defined in: src/managers/PageManager.ts:4553

The page-authorship conversion at start-up (#2097), on the public pages:
best-effort, never throws, and runs while the site serves (WikiEngine does
not wait for it). See [convertAuthorship](#convertauthorship).

#### Returns

`Promise`\<[`AuthorshipConversion`](../interfaces/AuthorshipConversion.md) \| `null`\>

***

### convertPageToNcm()

> __convertPageToNcm__(`raw`): [`PageConvertResult`](../interfaces/PageConvertResult.md)

Defined in: src/managers/PageManager.ts:3319

Convert a stored page (frontmatter + body) to NCM, with every fix step
(#1332) — the one implementation behind Convert to NCM, agent ingest and
the MCP create/update tools.

The fix steps run on the body first, then `normalizeExistingPageToNcm`
(links, table up-convert, `ncmVersion`), so NCM's determinism stays owned
in one place. Each step that changed something is also reported as a
`converter-note` warning, so the existing preview and notification
surfaces show it without knowing about steps.

Pure: nothing is saved.

#### Parameters

##### raw

`string`

Full page text, YAML frontmatter and body

#### Returns

[`PageConvertResult`](../interfaces/PageConvertResult.md)

The NCM result and the fix steps that changed the body

***

### convertVaultAuthorship()

> __convertVaultAuthorship__(`ctx`, `owner`): `Promise`\<[`AuthorshipConversion`](../interfaces/AuthorshipConversion.md) \| `null`\>

Defined in: src/managers/PageManager.ts:4704

The authorship conversion for the vaults of `owner` this context can open
(#2097), when they are opened: at sign-in and unlock, where the owner's
keys are live. Each vault's pages (frontmatter, its own page index entry,
history, access lists) and the owner's vault trash; each vault is
recorded as done in its own migrations record and skipped from then on.
Postponed, and tried at the next opening, when the identity store cannot
answer; a page or tombstone that fails for its own reason is skipped and
counted, and keeps its vault from being recorded as done.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner

`string`

#### Returns

`Promise`\<[`AuthorshipConversion`](../interfaces/AuthorshipConversion.md) \| `null`\>

***

### declinedShippedPages()

> __declinedShippedPages__(): `Promise`\<`Record`\<`string`, `Record`\<`string`, [`DeclinedShippedPage`](../../../utils/seededShippedPages/interfaces/DeclinedShippedPage.md)\>\>\>

Defined in: src/managers/PageManager.ts:1182

Every shipped page this site has declined, as source id → uuid → entry
(#1412). Read by Required Pages Sync to list them.

#### Returns

`Promise`\<`Record`\<`string`, `Record`\<`string`, [`DeclinedShippedPage`](../../../utils/seededShippedPages/interfaces/DeclinedShippedPage.md)\>\>\>

***

### declineShippedPage()

> __declineShippedPage__(`sourceId`, `uuid`, `reason`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/PageManager.ts:1145

Record that this site will not take a shipped page from a source (#1412).

For a page whose title or slug belongs to a page the site would rather
keep: the seeder skips it from then on, so the conflict stops being
reported at every start-up. Nothing is written to any page, and the entry
is per source — an addon shipping the same uuid is still offered.

#### Parameters

##### sourceId

`string`

`required-pages`, or `addon:<name>`

##### uuid

`string`

The shipped page's uuid

##### reason

`string`

The conflict that prompted it

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who decided

#### Returns

`Promise`\<`boolean`\>

True when it was not already declined

***

### deletePage()

> __deletePage__(`identifier`, `ctx`, `options?`): `Promise`\<`boolean`\>

Defined in: src/managers/PageManager.ts:3435

Delete a page — the one door every delete goes through (#1462 slice 3).

There were two: this one and `deletePageWithContext`, which took a whole
WikiContext to read two fields off it and, when the context carried no
user, deleted as the anonymous subject — a caller that HAD a subject could
lose it on the way in. The context is mandatory and positional here, as it
is for a save.

The delete is soft (#947): the page goes to the trash with its history,
and the context names who put it there. Afterwards the page is taken out
of every shared index, here and nowhere else (#1462).

The write door decides `page-delete` on the page first (#1815), and the
delete is recorded as `page-delete` before it happens.

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is acting (#1179)

##### options?

`audit.skip` when the caller already recorded this
  delete; `audit.ipAddress`, the request's address, for the record

###### audit?

\{ `ipAddress?`: `string`; `skip?`: `boolean`; \}

###### audit.ipAddress?

`string`

###### audit.skip?

`boolean`

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

#### Throws

PageWriteRefusedError when `ctx` may not delete the page

#### Example

```ts
const deleted = await pageManager.deletePage('Old Page', req.userContext);
```

***

### deleteTestArtifacts()

> __deleteTestArtifacts__(`ctx`, `only?`): `Promise`\<\{ `deleted`: `object`[]; `failed`: `object`[]; \}\>

Defined in: src/managers/PageManager.ts:3521

Delete the pages a test made (#2008): every shared page carrying the
`test-artifact` system keyword (#1355), and never a page without it.
`only` narrows the set further — a deleted test account's profile is
`{ author, systemCategory: 'user-profile' }`.

Each page is recorded as `page-delete` before it is deleted (on-failure
refuse: a page whose record cannot be written is not deleted), then goes
through [deletePage](#deletepage), so the delete is soft and the shared indexes
follow. One page's failure never stops the rest; it is reported.

The caller decides who may ask: the sweep route asks `admin-system`, and
an account delete has already been decided as `user-delete` and sends a
system job (#1815). Each delete is still decided by `deletePage`. Private
vault pages are not in the shared index, so they are not reached here.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is acting; named in every record

##### only?

Narrow to one author and/or system-category

###### author?

`string`

###### systemCategory?

`string`

#### Returns

`Promise`\<\{ `deleted`: `object`[]; `failed`: `object`[]; \}\>

***

### filterPagesFor()

> __filterPagesFor__(`subject`, `names`, `action?`): `Promise`\<`string`[]\>

Defined in: src/managers/PageManager.ts:4087

Which of these named pages may `subject` perform `action` on — the
[listPagesFor](#listpagesfor) door for a list someone else found: search hits
(#1962), whatever index they came from.

Each name is resolved as `/view/<name>` resolves it, and the batch is
decided by `PolicyInformationPoint.filterAccessiblePages`, so a hit is
kept exactly when its reader may open the page. A name that resolves to
no page (a ghost in the index) is dropped. Order is preserved; no log line
or audit record per page. Without a PolicyInformationPoint nothing is kept.

#### Parameters

##### subject

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) \| `null` \| `undefined`

The reader's own context, forwarded

##### names

readonly `string`[]

Page names, as the index holds them

##### action?

`string` = `'view'`

Legacy verb (`view`, `edit`) or policy action; default `view`

#### Returns

`Promise`\<`string`[]\>

***

### flushWriteQueue()

> __flushWriteQueue__(): `Promise`\<`void`\>

Defined in: src/managers/PageManager.ts:5456

Flush any pending write queues in the provider (e.g. page-index writes).
Call before process exit to prevent data loss on unclean shutdown.

#### Returns

`Promise`\<`void`\>

***

### get()

> __get__(`identifier`): `Promise`\<[`CreativeWork`](../../../types/Schema/type-aliases/CreativeWork.md) \| `null`\>

Defined in: src/managers/PageManager.ts:833

CatalogSource.get — fetch a single page by UUID and return its `Article`.

Returns null for unknown UUIDs. ACL filtering is __not__ applied here —
callers needing the full WikiContext path should go through `getPage()`.
(Same convention as `MediaManager.get` / `AttachmentManager.get`.)

#### Parameters

##### identifier

`string`

#### Returns

`Promise`\<[`CreativeWork`](../../../types/Schema/type-aliases/CreativeWork.md) \| `null`\>

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`get`](../../../types/Schema/interfaces/CatalogSource.md#get)

***

### getAddonSeededIndexEntries()

> __getAddonSeededIndexEntries__(): `object`[]

Defined in: src/managers/PageManager.ts:4242

Every indexed page carrying an `addon` provenance stamp.
Used by addon orphan detection; reads the in-memory index, no disk I/O.
Returns [] on providers that do not maintain a page index.

#### Returns

`object`[]

***

### getAllPageNames()

> __getAllPageNames__(): `Promise`\<`string`[]\>

Defined in: src/managers/PageManager.ts:4166

#### Returns

`Promise`\<`string`[]\>

***

### getAllPages()

> __getAllPages__(): `Promise`\<`string`[]\>

Defined in: src/managers/PageManager.ts:4034

Get all page titles

Returns a sorted list of all page titles in the wiki.

#### Returns

`Promise`\<`string`[]\>

Sorted array of page titles

#### Async

#### Example

```ts
const pages = await pageManager.getAllPages();
console.log('Total pages:', pages.length);
```

***

### getCurrentPageProvider()

> __getCurrentPageProvider__(): [`PageProvider`](../../../types/Provider/interfaces/PageProvider.md) \| `null`

Defined in: src/managers/PageManager.ts:1561

Get the current page provider instance

#### Returns

[`PageProvider`](../../../types/Provider/interfaces/PageProvider.md) \| `null`

The active provider instance

#### Example

```ts
const provider = pageManager.getCurrentPageProvider();
const info = provider.getProviderInfo();
console.log('Using:', info.name);
```

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

### getManagerStats()

> __getManagerStats__(): `Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/PageManager.ts:4161

# 1006: how many pages this instance holds.

Names, not pages: `getAllPageNames()` reads the index, where
`getAllPages()` would load every page's content to count them.

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

### getPage()

> __getPage__(`identifier`, `ctx`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/managers/PageManager.ts:1598

Get complete page with content and metadata

Retrieves a page by UUID, title, or slug. Returns the full page object
including content, metadata, and file path information.

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Page object or null if not found

#### Async

#### Example

```ts
const page = await pageManager.getPage('Main');
console.log(page.title, page.metadata.author);
```

***

### getPageBySlug()

> __getPageBySlug__(`slug`, `ctx`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/managers/PageManager.ts:4187

Get a page by its slug

#### Parameters

##### slug

`string`

URL-friendly slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Page or null if not found

***

### getPageByUUID()

> __getPageByUUID__(`uuid`, `ctx`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/managers/PageManager.ts:4175

Get a page by its UUID

#### Parameters

##### uuid

`string`

Page UUID

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Page or null if not found

***

### getPageContent()

> __getPageContent__(`identifier`, `ctx`): `Promise`\<`string`\>

Defined in: src/managers/PageManager.ts:1728

Get only page content (without metadata)

More efficient than getPage() when only content is needed.

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`string`\>

Markdown content

#### Async

#### Example

```ts
const content = await pageManager.getPageContent('Main');
console.log(content);
```

***

### getPageMetadata()

> __getPageMetadata__(`identifier`, `ctx`): `Promise`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`\>

Defined in: src/managers/PageManager.ts:1808

#### Parameters

##### identifier

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`\>

***

### getPagesByCreator()

> __getPagesByCreator__(`username`, `ctx`, `options?`): `Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

Defined in: src/managers/PageManager.ts:4268

Pages owned by a given user (#640).

Authorization: callers MUST verify the requesting user is allowed to ask
about `username` (typically only their own username, or admin asking about
another). The provider does not enforce this — it filters by `author` /
`creator` only.

#### Parameters

##### username

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`GetPagesByCreatorOptions`](../../../types/Provider/interfaces/GetPagesByCreatorOptions.md) = `{}`

#### Returns

`Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

***

### getPagesByEditor()

> __getPagesByEditor__(`username`, `ctx`, `options?`): `Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

Defined in: src/managers/PageManager.ts:4290

Pages most recently edited by a user (#640 Phase 2).

#### Parameters

##### username

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`PagesScanOptions`](../../../types/Provider/interfaces/PagesScanOptions.md) = `{}`

#### Returns

`Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

***

### getPagesSharedWith()

> __getPagesSharedWith__(`principals`, `options?`): `Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

Defined in: src/managers/PageManager.ts:4303

Pages whose frontmatter audience matches any of the caller's principals,
excluding pages the caller already owns (#640 Phase 2). `options.username`
names the caller, so a page whose author is their identity

#### Parameters

##### principals

`string`[]

##### options?

[`PagesScanOptions`](../../../types/Provider/interfaces/PagesScanOptions.md) & `object` = `{}`

#### Returns

`Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

#### Id

counts as
theirs (#2097).

***

### getPageUUID()

> __getPageUUID__(`identifier`, `ctx`): `string` \| `null`

Defined in: src/managers/PageManager.ts:1565

#### Parameters

##### identifier

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`string` \| `null`

***

### getPrivatePageOwner()

> __getPrivatePageOwner__(`pageNameOrUuid`, `ctx`): `Promise`\<\{ `creator`: `string`; `store`: `string`; \} \| `null`\>

Defined in: src/managers/PageManager.ts:4362

Owner and store of a private page, or `null` when the page is not private
or does not exist (#1398). The owner owns the page and every attachment
uploaded onto it, so AttachmentManager uses this to route a new upload into
that owner's store.

# 1456: both come from the page's name, `private/{owner}/{store}/{title}`;
the page is looked up in that store through `ctx` only to confirm it exists.

#### Parameters

##### pageNameOrUuid

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<\{ `creator`: `string`; `store`: `string`; \} \| `null`\>

***

### getRawPageContent()

> __getRawPageContent__(`identifier`, `ctx`): `Promise`\<\{ `content`: `string`; `filePath`: `string`; \} \| `null`\>

Defined in: src/managers/PageManager.ts:1965

Read the literal raw file content for a page — frontmatter YAML + body
markdown together, exactly as it appears on disk. Backs the admin
"Edit raw" UI (#689); intended for recovery of pages whose frontmatter
the normal getPage() path sanitises or normalises away. Returns null
when the page is unknown or the provider doesn't support raw reads.

#### Parameters

##### identifier

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<\{ `content`: `string`; `filePath`: `string`; \} \| `null`\>

***

### getRecentChanges()

> __getRecentChanges__(`ctx`, `options?`): `Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

Defined in: src/managers/PageManager.ts:4217

Return pages most recently modified, sorted descending by lastModified (#635).

Delegates to the provider's in-memory state (pageIndex / pageCache) — no
direct disk I/O. Honors private-page visibility based on `options.principals`;
the provider derives the admin bypass from an `admin` principal (#1116).

Used by RecentChangesPlugin and any other consumer that needs a "recent edits"
feed. New code should prefer this over enumerating getAllPages().

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`RecentChangesOptions`](../../../types/Provider/interfaces/RecentChangesOptions.md) = `{}`

#### Returns

`Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/PageManager.ts:693

Initialize the PageManager by loading and initializing the configured provider

Reads the page provider configuration and dynamically loads the provider class.
The provider name is normalized from lowercase (config) to PascalCase (class name).

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object (unused, reads from ConfigurationManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available or provider fails to load

#### Example

```ts
await pageManager.initialize();
// Loads FileSystemProvider by default
```

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

### invalidatePageCache()

> __invalidatePageCache__(`identifier`): `string` \| `null`

Defined in: src/managers/PageManager.ts:1573

Evict a page's cached content, and bump the page-data version so every
cached render re-renders (#1751).

#### Parameters

##### identifier

`string`

#### Returns

`string` \| `null`

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

### isPageDeleted()

> __isPageDeleted__(`uuid`, `_ctx`): `boolean`

Defined in: src/managers/PageManager.ts:4015

Whether a page uuid is in the trash (#1403).

A seed of shipped pages must treat a trashed uuid as deliberately removed,
not missing. `pageExists` sees live pages only. A provider without soft
delete has no trash, so this is false there.

#### Parameters

##### uuid

`string`

Page UUID

##### \_ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is asking

#### Returns

`boolean`

True if the uuid has a trash entry

***

### isSharedIndexable()

> __isSharedIndexable__(`identifier`): `boolean`

Defined in: src/managers/PageManager.ts:3933

Whether a page may go into an index that every reader of this process or
its disk shares — the search index, the page-assets index, the link graph
and the known-page-name list (#1419).

Such an index is built as the anonymous subject (docs/planning/
private-stores.md, Context): the question is asked with that subject
stated, not with a default. A private page never qualifies (#1456): it
is listed only in its own store's indexes, encrypted or not.

#### Parameters

##### identifier

`string`

#### Returns

`boolean`

***

### isShippedPageCopy()

> __isShippedPageCopy__(`uuid`): `Promise`\<`boolean`\>

Defined in: src/managers/PageManager.ts:1321

Whether a page on the site is a shipped page (#1503): a copy of a shipped
original, its uuid in the site's seeded-pages record, from required-pages/
or an add-on's pages alike (operator, 2026-10-29). Decided per page, so a
page someone creates on the site in a shipped system-category is not
taken for a shipped one. Shipped pages are admin-only and never private.

#### Parameters

##### uuid

`string`

#### Returns

`Promise`\<`boolean`\>

***

### list()

> __list__(`query`): `Promise`\<[`CatalogPage`](../../../types/Schema/interfaces/CatalogPage.md)\>

Defined in: src/managers/PageManager.ts:850

CatalogSource.list — paginated list of CreativeWorks across all pages.

Initial implementation: pulls `getAllPageInfo()`, applies text / keyword
/ type / dateRange filters in-process, returns up to `query.limit`
items. Cursor pagination is not implemented yet — the existing
search-provider path (Lunr / ES) is the production query surface;
this method exists so cross-source CatalogManager fan-out works.

#### Parameters

##### query

[`CatalogQuery`](../../../types/Schema/interfaces/CatalogQuery.md)

#### Returns

`Promise`\<[`CatalogPage`](../../../types/Schema/interfaces/CatalogPage.md)\>

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`list`](../../../types/Schema/interfaces/CatalogSource.md#list)

***

### listCategoryPages()

> __listCategoryPages__(`category`): `Promise`\<`string`[]\>

Defined in: src/managers/PageManager.ts:3145

Every public page stamped with one system-category (#2299), by the name
`mayShowPage` takes. Vault pages are not listed: they are their owners', not
an administrator's to be told about. Says nothing about who may see a page;
the caller asks `mayShowPage` as the reader.

#### Parameters

##### category

`string`

The category's key or label, any case

#### Returns

`Promise`\<`string`[]\>

***

### listOwnDeletedPrivatePages()

> __listOwnDeletedPrivatePages__(`ctx`): `Promise`\<[`StoreDeletedEntry`](../../../types/Provider/interfaces/StoreDeletedEntry.md)[]\>

Defined in: src/managers/PageManager.ts:3211

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`StoreDeletedEntry`](../../../types/Provider/interfaces/StoreDeletedEntry.md)[]\>

***

### listOwnStoreIds()

> __listOwnStoreIds__(`ctx`): `Promise`\<`string`[]\>

Defined in: src/managers/PageManager.ts:3154

The store ids the requester has of their own (#1387).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`string`[]\>

***

### listOwnVaults()

> __listOwnVaults__(`ctx`): `Promise`\<`object`[]\>

Defined in: src/managers/PageManager.ts:3180

The requester's own vaults, each with its pages and whether it is
encrypted (#2245), for `/my/vaults`.

`state` is the vault's [VaultSealState](../../../utils/privateStoreMeta/type-aliases/VaultSealState.md) (#1834): `sealed` is
encrypted, `plain` is not, and `unopened` or `mismatch` is a vault whose
kind says it must be encrypted while its copy is not. `readable` is false
for a vault this context cannot open, such as a sealed vault still
locked: its pages are then unknown, not none.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`object`[]\>

***

### listPagesFor()

> __listPagesFor__(`subject`, `action?`): `Promise`\<`string`[]\>

Defined in: src/managers/PageManager.ts:4056

The pages `subject` may perform `action` on — the door for anything that
lists pages to a reader (#1219, guiding-framework rule 10).

A title is content: a private page named for what it holds discloses by
appearing in a list. `getAllPages()` above is the unfiltered index and
stays for callers with no reader — indexing, link graphs, jobs, and admin
surfaces already gated by `admin-system`. Anything rendered to a request
goes through here, so the listing and `canAccess` are the same evaluator
(`PolicyInformationPoint.filterAccessiblePages`). Without an PolicyInformationPoint nothing is
listed — never the unfiltered index by accident.

#### Parameters

##### subject

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md) \| `null` \| `undefined`

The reader's own context, forwarded (viaToken / viaShare ride on it)

##### action?

`string` = `'view'`

Legacy verb (`view`, `edit`) or policy action; default `view`

#### Returns

`Promise`\<`string`[]\>

***

### listVaultPages()

> __listVaultPages__(`ctx`, `owner`, `vault`): `Promise`\<`object`[]\>

Defined in: src/managers/PageManager.ts:3122

The current pages of one vault, as `ctx` may enter it (#1388): its owner,
or a share link the owner issued that names this vault. Anyone else gets
an empty list, the same as a vault with nothing in it. Whether each page
may then be read is still the page door's answer.

A shared folder (`SHARED_FOLDER_OWNER`, #2125): whoever the PDP permits
`shared-folder-read` on it.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner

`string`

##### vault

`string`

#### Returns

`Promise`\<`object`[]\>

***

### listVaultRepairs()

> __listVaultRepairs__(`ctx`, `opts?`): `Promise`\<[`VaultRepairItem`](../interfaces/VaultRepairItem.md)[]\>

Defined in: src/managers/PageManager.ts:5182

Every vault page the startup checks found with data outside its vault —
files in the shared pool (#1842), footnotes or comments in the public
folders (#1839) — as one list for the repair actions, with whether `ctx`
may repair each one here and, if not, why. Read from the checks' last
findings, so listing opens no vault. Only what `ctx` may see: every item
for someone holding `admin-system` (owner, vault and page uuid, as the
subsystem banner already shows), otherwise the items of their own vaults.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### opts?

###### details?

`boolean`

#### Returns

`Promise`\<[`VaultRepairItem`](../interfaces/VaultRepairItem.md)[]\>

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

### mayEditPage()

> __mayEditPage__(`identifier`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/PageManager.ts:2204

Would `ctx` be allowed to edit this page — asked only to decide what to
offer or report, never before writing it (#1815). The same decision as
the write door, as an affordance: it records nothing (#1668). Saving still
asks the door.

#### Parameters

##### identifier

`string`

Page UUID, title, slug or vault name

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose question this is — never defaulted

#### Returns

`Promise`\<`boolean`\>

***

### mayShowPage()

> __mayShowPage__(`identifier`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/PageManager.ts:1902

Would `ctx` be allowed to read this page — asked only to decide whether to
SHOW something (`<wiki:If exists:Page>`), never before reading it (#1668).
The same `page-read` decision as [readPage](#readpage), so the two agree; it
reads no content and writes no audit record. A page `ctx` may not read
answers false, as one that does not exist does.

#### Parameters

##### identifier

`string`

Page UUID, title, slug or vault name

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose question this is (#1179) — never defaulted

#### Returns

`Promise`\<`boolean`\>

***

### migratePrivateLinks()

> __migratePrivateLinks__(`ctx`, `owner?`): `Promise`\<`number`\>

Defined in: src/managers/PageManager.ts:4863

Rewrite `[Title]` to `[store/Title]` in the private pages that mean it.

Only a target naming a page in the SAME store is rewritten — never a
public title, never another store — and a target that already parses as a
private link is left alone, so a second run writes nothing
([rewriteToPrivateLinks](../../../utils/privateLinkRewrite/functions/rewriteToPrivateLinks.md)).

Each page goes through [savePage](#savepage), so it is versioned, reindexed and
audited as `link-rewrite`. It keeps its `lastModified` (operator,
2026-09-23: a syntax rewrite must not move a page to the top of Recent
Changes) and its `editor`: nobody edited it.

A store that has been migrated records it beside its own indexes and is
skipped from then on. One store's failure never stops the others.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose reading and writing this is (#1179). Only the stores
  this context can open are visited: the system principal reaches the
  unencrypted ones, an owner's own unlocked session reaches theirs.

##### owner?

`string`

One user's stores, or every readable store when omitted

#### Returns

`Promise`\<`number`\>

How many pages were rewritten

***

### migratePrivateLinksAtBoot()

> __migratePrivateLinksAtBoot__(): `Promise`\<`void`\>

Defined in: src/managers/PageManager.ts:4460

Run the link migrations at boot: over the unencrypted stores (#1457,
# 1506), then, once per site, `private/…` → `vaults/…` in the public pages
(#1506).

Best-effort: a failure is logged and never blocks start-up. An encrypted
store is not readable here and is not touched — it migrates at its
owner's unlock, through [migratePrivateLinks](#migrateprivatelinks).

# 1815 (operator, 2026-11-04, decision 2): the public pages are the system
principal's work; each user's vaults are a job on behalf of that user
([jobContextForOwner](../../../context/JobContext/functions/jobContextForOwner.md)), through the write door like any write. The
vault container rule admits a job carrying its owner, and the owner's
rights in their own vaults come from policy, resolved when each write is
decided. The system principal is let into no vault. A shared folder is
not a user's and opens to no boot job (its key never reaches one), so it
is not visited.

#### Returns

`Promise`\<`void`\>

***

### migratePrivateSlugs()

> __migratePrivateSlugs__(`ctx`, `owner?`): `Promise`\<`number`\>

Defined in: src/managers/PageManager.ts:5074

Every private slug in the `vaults--…` form (#1507), once per vault. A
private page's slug is made fresh on every save, so each page whose slug
is anything else is saved again, unchanged otherwise: same body,
`lastModified` and `editor`. That is `private--…` from before #1507, and a
plain slug from before #1456, which could clash with a public page's.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner?

`string`

#### Returns

`Promise`\<`number`\>

How many pages were re-saved

***

### migrateVaultUrlsInPublicPages()

> __migrateVaultUrlsInPublicPages__(`ctx`): `Promise`\<`number`\>

Defined in: src/managers/PageManager.ts:4503

`private/…` → `vaults/…` in every public page, once per site (#1506). The
site records it in `site-migrations.json` in the instance data folder,
beside `seeded-shipped-pages.json`; a second run would write nothing
anyway ([rewriteLegacyVaultUrls](../../../utils/vaultUrlRewrite/functions/rewriteLegacyVaultUrls.md)).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`number`\>

How many pages were rewritten

***

### moveCapturesToCaptureVault()

> __moveCapturesToCaptureVault__(`ctx`, `owner?`): `Promise`\<`number`\>

Defined in: src/managers/PageManager.ts:5025

Move the captures made before #1505 into the capture vault, with
`system-category: capture`. Until then a capture was a `general` page
carrying the system keyword `capture`, saved in its author's default
vault. A page whose system-category someone changed is left where it is.

Runs over the vaults `ctx` can open — at boot, the unencrypted ones — and
each vault records that it is done. A page whose title is already taken
in the capture vault stays where it is, and is still found there: the
capture page looks in the capture vault, then the default one.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner?

`string`

#### Returns

`Promise`\<`number`\>

How many pages moved

***

### movePagesToCategoryVaults()

> __movePagesToCategoryVaults__(`ctx`, `owner?`): `Promise`\<`number`\>

Defined in: src/managers/PageManager.ts:5051

Move private pages made before #1505 into their system-category's own
vault (#1507). Until then every private page went to its owner's default
vault, whatever its system-category — journal entries included. A page in
the default vault whose system-category declares another vault
(`storageLocation.privatestore`) moves there; a page in any other vault
was put there on purpose and is left alone.

Same rules as [moveCapturesToCaptureVault](#movecapturestocapturevault): the vaults `ctx` can
open, once per vault, and a page whose title is taken where it would go
stays where it is.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner?

`string`

#### Returns

`Promise`\<`number`\>

How many pages moved

***

### movePageToVault()

> __movePageToVault__(`pageName`, `toVault`, `ctx`, `changes?`): `Promise`\<[`PageSaveResult`](../interfaces/PageSaveResult.md)\>

Defined in: src/managers/PageManager.ts:4976

Move a private page into another of its owner's vaults (#1505), under the
same title. The page, its history and its index entries go with it; it
keeps its `lastModified` and `editor`, since nobody edited it. The audit
record is a rename, from the old path to the new.

Access is decided by the save it makes, as for every write (#1815): an
edit of the page where it is and a create in the vault it goes to. A
page is never moved out of an encrypted vault
into one that is not, since that would write it in the clear.

#### Parameters

##### pageName

`string`

The page's private name, `vaults/{owner}/{vault}/{title}`

##### toVault

`string`

The vault to move it to

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is acting (#1179)

##### changes?

`Partial`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)\> = `{}`

Frontmatter to change in the same write, e.g. its `system-category`

#### Returns

`Promise`\<[`PageSaveResult`](../interfaces/PageSaveResult.md)\>

Where the page landed

***

### normalizePageContent()

> __normalizePageContent__(`content`, `options?`): [`FixResult`](../../../converters/ncm/fix/types/interfaces/FixResult.md)

Defined in: src/managers/PageManager.ts:3405

Run the Markdown fix steps over a page body (#1332).

The one entry point for rewriting page text, so Convert to NCM, ingest,
import and migrations cannot disagree about what a page should become.
Every step runs, in registry order; `steps` picks steps by id instead.
An ordinary save never calls this.

Pure: nothing is saved. The result lists what each step changed, so the
caller can report it.

#### Parameters

##### content

`string`

Page body, without frontmatter

##### options?

[`RunFixesOptions`](../../../converters/ncm/fix/interfaces/RunFixesOptions.md) = `{}`

`steps` by id; default every step

#### Returns

[`FixResult`](../../../converters/ncm/fix/types/interfaces/FixResult.md)

The fixed body and the changes, empty when nothing changed

#### Example

```ts
const { content, changes } = pageManager.normalizePageContent(body);
```

***

### pageExists()

> __pageExists__(`identifier`, `ctx`): `boolean`

Defined in: src/managers/PageManager.ts:3951

Check if page exists

Fast existence check without loading page content.

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`boolean`

True if page exists

#### Example

```ts
if (pageManager.pageExists('Main')) {
  console.log('Main page exists');
}
```

***

### pageUrl()

> __pageUrl__(`pageName`, `action?`): `string`

Defined in: src/managers/PageManager.ts:4380

The URL for `action` on the page named `pageName` (#1813): `/view/Main`,
or for a vault page `/vaults/{owner}/{vault}/{title}` and its actions below
it (#1456). The door an add-on asks; core's routes and views share the
same `utils/pageUrl`. Reads no data and no config.

#### Parameters

##### pageName

`string`

##### action?

[`PageAction`](../../../utils/pageUrl/type-aliases/PageAction.md) = `'view'`

#### Returns

`string`

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

### privatePageName()

> __privatePageName__(`owner`, `title`, `vault?`): `string`

Defined in: src/managers/PageManager.ts:4391

The page name of `title` in `owner`'s vault `vault`, or in their default
vault when no vault is given (#1813): `vaults/{owner}/{vault}/{title}`.
The default vault is the system-category entry marked default, read live
through ConfigurationManager (#1504). It names a page; it does not say the
page exists or that anyone may open it.

#### Parameters

##### owner

`string`

##### title

`string`

##### vault?

`string`

#### Returns

`string`

***

### purgeExpiredOwnPrivateTrash()

> __purgeExpiredOwnPrivateTrash__(`ctx`): `Promise`\<`number`\>

Defined in: src/managers/PageManager.ts:3285

Expire the requester's own private tombstones past the retention window
(#1459), in their session.

THE SPLIT, stated where it happens: the boot and hourly retention passes
run under a job context, which holds no store key, so they reach the
unencrypted stores only. A SEALED store can be opened by nobody but its
owner, so its trash is expired here, right after an unlock — the same
division as #1457's link migration and #1458's search-index build, and for
the same reason.

Best-effort: a failure is logged and never blocks the unlock.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

The owner's context, holding the unlocked store keys

#### Returns

`Promise`\<`number`\>

***

### purgeOwnPrivatePage()

> __purgeOwnPrivatePage__(`ctx`, `store`, `uuid`): `Promise`\<`boolean`\>

Defined in: src/managers/PageManager.ts:3262

Destroy one of the requester's trashed private pages for good (#1459):
the file, its version history in the store, and the tombstone.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is purging (#1179)

##### store

`string`

Which of the requester's stores

##### uuid

`string`

The trashed page's uuid

#### Returns

`Promise`\<`boolean`\>

***

### readablePrivateTitles()

> __readablePrivateTitles__(`owner`, `ctx`): `Promise`\<`Map`\<`string`, `Set`\<`string`\>\>\>

Defined in: src/managers/PageManager.ts:3994

The private titles `ctx` can see in `owner`'s stores, by store id (#1457).

For the one question a `[store/Title]` link asks while a PRIVATE page is
rendered: is that page there? A private page's HTML is never cached for
sharing (`isSharedIndexable` is false for every private name), so its
links may be answered for the reader in front of them.

A store `ctx` cannot open is absent from the map, not empty: the caller
must render "cannot say" as it renders for everyone, never as a missing
page. Titles are folded to lower case, which is how a store index matches
them, so a caller compares folded.

#### Parameters

##### owner

`string`

Whose stores

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose reading this is (#1179) — never rebuilt, never defaulted

#### Returns

`Promise`\<`Map`\<`string`, `Set`\<`string`\>\>\>

***

### readChromePage()

> __readChromePage__(`slot`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/managers/PageManager.ts:1627

The page in a site-chrome slot — the left menu, the footer, the page-tabs
template — read the same way for every caller (#952, #950, #1622).

Resolution order (#952):

  1. The configured page, when the slot's key is set. Authoritative: if
     that page is missing, the legacy chain is NOT tried, because silently
     substituting a page the operator did not choose is the problem the
     setting exists to remove.
  2. Otherwise the legacy slug chain (`left-menu-content` before
     `LeftMenu`), logged at info when a page shadows the core one.

Chrome is read as the anonymous reader, for every viewer: it frames every
page for everyone, and gating a fragment only ever removed navigation
site-wide without protecting the pages it links to (#950). A restriction
set on a chrome page is therefore reported, not enforced. This is not a
person's page view, so it does not pass the page-read door; it is the one
place chrome is read, which is what the door rule needs (#1622).

#### Parameters

##### slot

[`ChromeSlot`](../type-aliases/ChromeSlot.md)

Which chrome page

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

The page, or null when none resolves

***

### readPage()

> __readPage__(`identifier`, `ctx`): `Promise`\<[`PageRead`](../type-aliases/PageRead.md)\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md)\>\>

Defined in: src/managers/PageManager.ts:1914

Read a page — content and metadata — as `ctx`, if `ctx` may read it (#1622).

#### Parameters

##### identifier

`string`

Page UUID, title, slug or vault name

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose read this is (#1179) — never defaulted

#### Returns

`Promise`\<[`PageRead`](../type-aliases/PageRead.md)\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md)\>\>

The page, with the name and metadata the decision was made on,
  or why there is none

***

### readVersion()

> __readVersion__(`identifier`, `version`, `ctx`): `Promise`\<[`PageRead`](../type-aliases/PageRead.md)\<[`VersionContent`](../../../types/Version/interfaces/VersionContent.md)\>\>

Defined in: src/managers/PageManager.ts:1939

One past version of a page, if `ctx` may read the page (#1622).

#### Parameters

##### identifier

`string`

##### version

`number`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`PageRead`](../type-aliases/PageRead.md)\<[`VersionContent`](../../../types/Version/interfaces/VersionContent.md)\>\>

#### Throws

When the provider keeps no history, or the version does not exist

***

### readVersionDiff()

> __readVersionDiff__(`identifier`, `fromVersion`, `toVersion`, `ctx`): `Promise`\<[`PageRead`](../type-aliases/PageRead.md)\<[`VersionDiff`](../../../types/Version/interfaces/VersionDiff.md)\>\>

Defined in: src/managers/PageManager.ts:1951

The difference between two versions of a page, if `ctx` may read the page (#1622).

#### Parameters

##### identifier

`string`

##### fromVersion

`number`

##### toVersion

`number`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`PageRead`](../type-aliases/PageRead.md)\<[`VersionDiff`](../../../types/Version/interfaces/VersionDiff.md)\>\>

#### Throws

When the provider keeps no history, or either version does not exist

***

### readVersionHistory()

> __readVersionHistory__(`identifier`, `ctx`, `limit?`): `Promise`\<[`PageRead`](../type-aliases/PageRead.md)\<[`VersionHistoryEntry`](../../../types/Version/interfaces/VersionHistoryEntry.md)[]\>\>

Defined in: src/managers/PageManager.ts:1927

A page's version history, newest first, if `ctx` may read the page (#1622).

#### Parameters

##### identifier

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### limit?

`number`

#### Returns

`Promise`\<[`PageRead`](../type-aliases/PageRead.md)\<[`VersionHistoryEntry`](../../../types/Version/interfaces/VersionHistoryEntry.md)[]\>\>

#### Throws

When the provider keeps no history, or the history cannot be read

***

### rebuild()

> __rebuild__(`_opts?`): `Promise`\<`void`\>

Defined in: src/managers/PageManager.ts:902

CatalogSource.rebuild — re-scan storage and rebuild the page-index. Wraps
`provider.refreshPageList()`. The `force` option is accepted for
`RebuildOpts` compatibility but doesn't change behavior — the underlying
provider always does a full rescan.

#### Parameters

##### \_opts?

[`RebuildOpts`](../../../types/Schema/interfaces/RebuildOpts.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`rebuild`](../../../types/Schema/interfaces/CatalogSource.md#rebuild)

***

### rebuildPageIndex()

> __rebuildPageIndex__(): `Promise`\<\{ `changed`: `number`; `historyInRequiredPages`: `number`; `keptUnscanned`: `number`; `pages`: `number`; `removed`: `string`[]; \} \| `null`\>

Defined in: src/managers/PageManager.ts:4411

# 1374: rewrite the provider's persistent page index from its last disk scan
(run [refreshPageList](#refreshpagelist) first). Null when the provider keeps no such
index.

#### Returns

`Promise`\<\{ `changed`: `number`; `historyInRequiredPages`: `number`; `keptUnscanned`: `number`; `pages`: `number`; `removed`: `string`[]; \} \| `null`\>

***

### rebuildStoreSearchIndex()

> __rebuildStoreSearchIndex__(`ctx`, `owner`, `store`): `Promise`\<`number`\>

Defined in: src/managers/PageManager.ts:3834

Build a store's search index from its pages, replacing whatever is there.

The repair for a lost or stale index, and what a store with none gets at
its first boot or unlock. The pages are read through this door with `ctx`,
so a sealed store is read with the owner's key and nothing reads a store
file from outside the provider.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose reading and writing this is (#1179)

##### owner

`string`

Whose store

##### store

`string`

Which store

#### Returns

`Promise`\<`number`\>

How many documents the index now holds

***

### refreshPageList()

> __refreshPageList__(): `Promise`\<`void`\>

Defined in: src/managers/PageManager.ts:4399

#### Returns

`Promise`\<`void`\>

***

### repairAllVaultPages()

> __repairAllVaultPages__(`ctx`, `opts?`): `Promise`\<`object` & [`VaultRepairCounts`](../interfaces/VaultRepairCounts.md)\>

Defined in: src/managers/PageManager.ts:5355

"Repair all I can" (#1842): every listed item `ctx` may repair, one by
one through [repairVaultPage](#repairvaultpage); one item's failure never stops the
rest. The checks run again once, at the end.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### opts?

###### ownOnly?

`boolean`

Only `ctx`'s own vaults (the profile's "Move all into my vaults")

#### Returns

`Promise`\<`object` & [`VaultRepairCounts`](../interfaces/VaultRepairCounts.md)\>

***

### repairVaultPage()

> __repairVaultPage__(`target`, `ctx`, `opts?`): `Promise`\<[`VaultRepairResult`](../type-aliases/VaultRepairResult.md)\>

Defined in: src/managers/PageManager.ts:5271

Move one vault page's leftovers into its vault (#1842): the shared-pool
files it uses (`AttachmentManager.movePoolFilesIntoVault`) and its
footnotes and comments from the public folders
(`FootnoteManager` / `CommentManager.moveOutside…IntoVault`), each by its
own manager through the vault's store I/O — sealed when the vault is. A
pool file another public page uses is copied, never taken from it.

`page` null is the startup check's "pages named by shared records": every
page of that vault a shared-pool record still names, files only.

Who may: the vault's owner, in their own session (a sealed vault needs its
key, so it must be open); for a vault that isn't sealed, also someone
holding `admin-system`. A sealed vault asked for by anyone but its owner
is refused, and nothing changes.

Recorded as `vault-repair` before anything moves (on-failure refuse), with
the counts it is about to move. Then the three checks run again, so the
subsystem banner clears once nothing is left.

#### Parameters

##### target

###### owner

`string`

###### page

`string` \| `null`

###### vault

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### opts?

###### recheck?

`boolean`

#### Returns

`Promise`\<[`VaultRepairResult`](../type-aliases/VaultRepairResult.md)\>

***

### reportUnmatchableAddonAudiences()

> __reportUnmatchableAddonAudiences__(): `Promise`\<`object`[]\>

Defined in: src/managers/PageManager.ts:4141

At startup, once add-ons have loaded (#1964): warn about every page whose
`audience` names an add-on that can match nobody — unknown,
not per-person, or not loaded.

#### Returns

`Promise`\<`object`[]\>

Each page and slug warned about

***

### requiredPagesSource()

> __requiredPagesSource__(): [`ShippedPageSource`](../interfaces/ShippedPageSource.md)

Defined in: src/managers/PageManager.ts:1200

The source for the required pages this release ships (#1405, #1406).
Pages in a system-category with no `storageLocation` (never stored on the
site, #1503) are excluded.

#### Returns

[`ShippedPageSource`](../interfaces/ShippedPageSource.md)

***

### resolveFormerTitle()

> __resolveFormerTitle__(`formerTitle`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/PageManager.ts:1762

Resolve a former page title to the page that holds it now, or null (#1105).

__Callers must have already failed live resolution.__ This is a fallback, not
a lookup: answering for a title that still exists would let a stale name
shadow a real page. `viewPage` calls it only on the not-found path.

Returns null on ambiguity rather than guessing. A confidently wrong redirect
to a page that merely once shared a name is worse than the 404 it replaces —
a 404 is visibly broken, and the wrong page is not.

#### Parameters

##### formerTitle

`string`

The title that failed to resolve

#### Returns

`Promise`\<`string` \| `null`\>

The current title of the page that was renamed from it, or null

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/managers/PageManager.ts:5527

Restore pages from backup data

Delegates to the provider's restore() method to recreate all pages
from the backup data.

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

***

### restoreDeletedPage()

> __restoreDeletedPage__(`uuid`, `ctx`): `Promise`\<\{ `ok`: `true`; `title`: `string`; \} \| \{ `detail?`: `string`; `ok`: `false`; `reason`: `string`; \}\>

Defined in: src/managers/PageManager.ts:3006

Bring a page back from the trash (#947), and back into the shared
indexes (#1462 slice 3).

The provider moves the file and its history back; a restore is then a
save-shaped change — the page is there again, under its restored title —
so the link graph, search, mentions, assets and the rendered cache are
brought in step here, where every other write has them done. The route
used to do a partial job of this itself (search and the link graph only).

#### Parameters

##### uuid

`string`

The trashed page's UUID

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is acting (#1179); the restored page is read as them

#### Returns

`Promise`\<\{ `ok`: `true`; `title`: `string`; \} \| \{ `detail?`: `string`; `ok`: `false`; `reason`: `string`; \}\>

The provider's result, unchanged — `ok`, or why not

***

### restoreIsStaged()

> __restoreIsStaged__(): `boolean`

Defined in: src/managers/BaseManager.ts:707

Whether this manager's `restore()` stages for the next start instead of
writing into the running site (#1723, #1876). BackupManager stages every
such manager in a site restore together, all or nothing, after a backup
of the live data. The default: true when it declares folders or files
(#1985), which BackupManager stages; otherwise false, the restore writes
live.

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`restoreIsStaged`](../../BaseManager/classes/default.md#restoreisstaged)

***

### restoreOwnPrivatePage()

> __restoreOwnPrivatePage__(`ctx`, `store`, `uuid`): `Promise`\<[`StoreRestoreResult`](../../../types/Provider/type-aliases/StoreRestoreResult.md)\>

Defined in: src/managers/PageManager.ts:3232

Bring one of the requester's private pages back from its store's trash
(#1459).

The provider moves the file back and restores the store's page-index
entry; the store's search index is rebuilt for that page here, through the
same reconciliation every save and restore runs, so no index is left
behind. The page's version history never moved, so it is simply there again.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is restoring (#1179)

##### store

`string`

Which of the requester's stores

##### uuid

`string`

The trashed page's uuid

#### Returns

`Promise`\<[`StoreRestoreResult`](../../../types/Provider/type-aliases/StoreRestoreResult.md)\>

***

### restoreVersion()

> __restoreVersion__(`identifier`, `version`, `ctx`): `Promise`\<[`PageSaveResult`](../interfaces/PageSaveResult.md) & `object`\>

Defined in: src/managers/PageManager.ts:2940

Put an old version's body back, as a new version (#1462 slice 3).

A restore is a save: it writes the page. It used to call the provider's
own `restoreVersion`, which saved underneath the door — no content
validation, no uniqueness check, no audit record and no shared-index
work, so a restored page kept the RESTORED body on disk while search, the
link graph and the rendered cache still described the one it replaced.
Here the version is read and the body goes back through `savePage`.

Nothing is destroyed: the newer versions stay in the history, and the
restore is simply the newest one.

#### Parameters

##### identifier

`string`

Page UUID, title or slug

##### version

`number`

The version whose body to restore

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is acting (#1179); the restore is attributed to them

#### Returns

`Promise`\<[`PageSaveResult`](../interfaces/PageSaveResult.md) & `object`\>

Where the page landed, and the version number this created

#### Throws

When the page, the version or the provider's history is missing

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

### savePage()

> __savePage__(`pageName`, `content`, `metadata?`, `ctx`, `options?`): `Promise`\<[`PageSaveResult`](../interfaces/PageSaveResult.md)\>

Defined in: src/managers/PageManager.ts:2670

Save a page — the one door every write goes through (#1462 slice 2).

Creates a page or updates one, and owns everything a write must not be
able to forget: content validation (#1037), the ACL-markup refusal,
author preservation and the editor of record (#1354), agent provenance
(#946), former titles (#1105), the privacy and vocabulary rules (#639,
# 893, #915), metadata sanitisation (#296), the uniqueness check (#510),
the shared indexes (#1462) and the audit event (#1121).

`ctx` is mandatory and positional: the save acts as the caller's subject
(#1179), a private-store write reaches that session's keys through it
(#1382), and the audit record names it. The write is decided here, for
that context, before anything is written (#1815): `page-edit` on the page
as it is, `page-create` where it is going when that is somewhere new. A caller forwards the context it
was given — a request's subject, or the job's for boot and scheduled
work — and never invents one.

#### Parameters

##### pageName

`string`

The page to write: its title, or a private path (#1456)

##### content

`string`

The body, written exactly as given — a save never rewrites it (#1332)

##### metadata?

`Partial`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)\> = `{}`

Frontmatter; server-owned fields in it are discarded, not merged

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is acting (#1179)

##### options?

[`PageSaveOptions`](../interfaces/PageSaveOptions.md) = `{}`

Validation and conflict-check opt-outs, `rawFrontmatter` (#689),
  `preserveLastModified`, `preserveEditor` (#1457), audit enrichment

#### Returns

`Promise`\<[`PageSaveResult`](../interfaces/PageSaveResult.md)\>

Where the page landed, and what it was called before

#### Throws

PageWriteRefusedError when `ctx` may not make this write

#### Example

```ts
await pageManager.savePage('New Page', '# Hello World', { 'user-keywords': ['tutorial'] }, req.userContext);
```

***

### saveRawPageWithAdminOverride()

> __saveRawPageWithAdminOverride__(`pageName`, `rawFileContent`, `ctx`): `Promise`\<[`PageSaveResult`](../interfaces/PageSaveResult.md)\>

Defined in: src/managers/PageManager.ts:2232

Admin-override save (#689): the admin "Edit raw" textarea, split into
frontmatter and body and written through the door (#1462).

It goes through `savePage` like every other write — so it versions, keeps
the shared indexes in step and is audited — with the three opt-outs that
make raw editing what it is, stated at this one call site:

  rawFrontmatter    the file's bytes are the point: no sanitisation, no
                    stamping. The admin is repairing a file, not authoring
                    a revision, so they do NOT become its `editor`.
  skipConflictCheck a duplicate slug or uuid is what it was opened to fix.
  skipValidation    so is content a filter rule refuses.

The audit op is pinned to `edit`: the raw editor writes an existing file
in place, and the identifier in its URL may be a uuid, so a difference
between it and the frontmatter title is not a rename. The route adds its
own `page.raw-edit` record, which carries what this one cannot — the
admin override, the file path and the byte count.

Throws if the textarea content isn't parseable YAML.

#### Parameters

##### pageName

`string`

##### rawFileContent

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`PageSaveResult`](../interfaces/PageSaveResult.md)\>

***

### searchOwnPrivatePages()

> __searchOwnPrivatePages__(`ctx`, `ask?`): `Promise`\<([`StoreSearchMatch`](../../../utils/storeSearchIndex/interfaces/StoreSearchMatch.md) & `object`)[]\>

Defined in: src/managers/PageManager.ts:3752

The requester's own private pages that match, from their stores' own
search indexes (#1458).

Only the requester's own container is read: `mayActInPrivateContainer` is
the same rule the page gate applies, so no role reaches in and an admin
searching finds nothing of anyone else's. A store whose key this context
does not hold contributes nothing — a locked store simply yields no
matches, never a plaintext read.

Each match carries the page's private NAME (`private/{owner}/{store}/{title}`),
so `pageUrl` builds a link that works.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is searching (#1179) — never rebuilt, never defaulted

##### ask?

[`StoreSearchQuery`](../../../utils/storeSearchIndex/interfaces/StoreSearchQuery.md) = `{}`

The query, as [matchStoreSearch](../../../utils/storeSearchIndex/functions/matchStoreSearch.md) reads it

#### Returns

`Promise`\<([`StoreSearchMatch`](../../../utils/storeSearchIndex/interfaces/StoreSearchMatch.md) & `object`)[]\>

***

### searchSharedFolderPages()

> __searchSharedFolderPages__(`ctx`, `folders`, `ask?`): `Promise`\<([`StoreSearchMatch`](../../../utils/storeSearchIndex/interfaces/StoreSearchMatch.md) & `object`)[]\>

Defined in: src/managers/PageManager.ts:3777

The pages of shared folders that match (#2125), from each folder's own
sealed search index, as a private store's are found. Only the folders
`ctx` may read: each is asked `shared-folder-read` here, whatever the
caller passed, and a folder it may not read gives nothing, not even a
count (decision 7). Folder pages are in no site-wide index.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is searching (#1179)

##### folders

readonly `string`[]

The folders to search, by name (SharedFolderManager's list)

##### ask?

[`StoreSearchQuery`](../../../utils/storeSearchIndex/interfaces/StoreSearchQuery.md) = `{}`

The query, as [matchStoreSearch](../../../utils/storeSearchIndex/functions/matchStoreSearch.md) reads it

#### Returns

`Promise`\<([`StoreSearchMatch`](../../../utils/storeSearchIndex/interfaces/StoreSearchMatch.md) & `object`)[]\>

***

### seedRequiredPages()

> __seedRequiredPages__(): `Promise`\<`void`\>

Defined in: src/managers/PageManager.ts:1443

Seed the required pages this release ships (#1405). Runs at the end of
engine start-up, once ValidationManager and SearchManager exist, so a
seeded page gets the conflict check and search indexing a save gets.

A required page is seeded once per site: pages new in a release appear at
restart, and a page removed on the site stays removed (#954). Pages in a
category whose source is `repo` are never seeded.

Best-effort: a failure is logged and never blocks start-up.

#### Returns

`Promise`\<`void`\>

***

### seedShippedPages()

> __seedShippedPages__(`source`, `ctx`): `Promise`\<[`ShippedPageSeedReport`](../interfaces/ShippedPageSeedReport.md)\>

Defined in: src/managers/PageManager.ts:933

Seed the pages a source ships into this site (#1405, epic #1404).

The one place shipped pages are seeded. For each source page, in order:

- no valid uuid, no title or no slug: skipped and reported
- a uuid already used by another file of the same source: skipped and reported
- excluded by the source (e.g. github-only categories): skipped
- __in this site's seeded record__: never seeded again. If it is no longer
  live it was removed here, and it stays removed.
- live already: added to the record
- in the trash: added to the record and skipped (#1403)
- otherwise: saved through `savePage` with the source's stamp, indexed for
  search, and added to the record

A save the ValidationManager refuses (a title or slug held by another uuid)
is reported, not retried; Required Pages Sync shows it as a UUID mismatch.

A source this site has no record for yet starts it from the uuids that are
live or in the trash, so an established site does not treat its shipped
pages as new.

#### Parameters

##### source

[`ShippedPageSource`](../interfaces/ShippedPageSource.md)

Where the pages come from and how they are stamped

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who seeds; a boot job's system context

#### Returns

`Promise`\<[`ShippedPageSeedReport`](../interfaces/ShippedPageSeedReport.md)\>

What happened to each source page

***

### setIndexAddon()

> __setIndexAddon__(`uuid`, `addonName`): `Promise`\<`boolean`\>

Defined in: src/managers/PageManager.ts:4253

Set the `addon` stamp on an existing index entry without rewriting the page.
Used by the boot-time back-fill. Returns false when unsupported or unchanged.

#### Parameters

##### uuid

`string`

##### addonName

`string`

#### Returns

`Promise`\<`boolean`\>

***

### shippedSystemCategories()

> __shippedSystemCategories__(): `Promise`\<`Set`\<`string`\>\>

Defined in: src/managers/PageManager.ts:1241

The system-categories that ship pages (#1503), lower-cased: the
`system-category:` values in the frontmatter of required-pages/ (read
once) and of each enabled add-on's pages (read once per add-on; a page
without one is `addon`, as the seed stamps it). No setting names them
(operator, 2026-09-28). A file the seed would exclude is left out.

Only for category questions (moving a page into one, the #1377 check):
whether a page is shipped is [isShippedPageCopy](#isshippedpagecopy), per page.

#### Returns

`Promise`\<`Set`\<`string`\>\>

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/PageManager.ts:5471

Shutdown the PageManager and its provider

Cleanly shuts down the provider, closing connections and flushing caches.

#### Returns

`Promise`\<`void`\>

#### Async

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

### syncShippedPages()

> __syncShippedPages__(`source`, `uuids`, `options`, `ctx`): `Promise`\<[`ShippedPageSyncReport`](../interfaces/ShippedPageSyncReport.md)\>

Defined in: src/managers/PageManager.ts:1052

Save the source's copy of the given uuids as this site's pages (#1406) —
the explicit sync behind Admin → Required Pages Sync.

Unlike the boot seed this overwrites a live page, and it ignores the
seeded-pages record: an admin's Sync is how a page removed on the site is
brought back. Without `force`, a live page edited on this site (the
`user-modified` flag, or a body that no longer matches its stamp) is left
alone and reported as protected.

A live page under another title is saved under that title, with the
source title in the metadata — a rename, not a second page (#1376).

#### Parameters

##### source

[`ShippedPageSource`](../interfaces/ShippedPageSource.md)

Where the pages come from and how they are stamped

##### uuids

`string`[]

Pages to sync

##### options

`force` overwrites pages edited on this site

###### force?

`boolean`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who asked

#### Returns

`Promise`\<[`ShippedPageSyncReport`](../interfaces/ShippedPageSyncReport.md)\>

What happened to each uuid

***

### systemCategoryForWrite()

> __systemCategoryForWrite__(`ctx`, `requested`, `current?`, `fallback?`): `Promise`\<[`SystemCategoryForWrite`](../type-aliases/SystemCategoryForWrite.md)\>

Defined in: src/managers/PageManager.ts:1298

Which system-category a write by `ctx` gives a page (#1503, operator
2026-10-29): only a holder of `page-categorize` (#2255; shipped to admin)
sets or changes one. `shared` is set by nobody: a page created in a shared
folder gets it at the write door (`savePage`), and a request naming it for
any other page is refused, `page-categorize` or not. Anyone else's new page takes `fallback` (else the default
system-category) and an existing page keeps its own (`current`); a request
naming any other is refused, never rewritten. An administrator's request
comes back as given (`undefined` when it names none), for the caller's own
validation. Every write path that takes a system-category from a request
asks here: create, save, ingest, takeout import.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is writing

##### requested

`unknown`

The system-category the request names, if any

##### current?

`string` \| `null`

The page's system-category now; absent for a new page

##### fallback?

`string`

A new page's system-category when not the default (a vault's own)

#### Returns

`Promise`\<[`SystemCategoryForWrite`](../type-aliases/SystemCategoryForWrite.md)\>

***

### toCreativeWork()

> __toCreativeWork__(`pageName`, `metadata`, `options?`): [`CreativeWork`](../../../types/Schema/type-aliases/CreativeWork.md)

Defined in: src/managers/PageManager.ts:818

Convert a single page (frontmatter + name) to its schema.org `Article`
record. Public so view-page / API consumers can build the same shape
without rerouting through `CatalogManager`.

The render mapper for the `<script type="application/ld+json">` block on
`view.ejs` is a separate utility (`src/utils/buildPageJsonLd.ts`) — it
adds `@context` and a couple of JSON-LD-render conventions on top of this
internal record. Per `docs/schemas.md` Decision 11.

#### Parameters

##### pageName

`string`

##### metadata

[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null` \| `undefined`

##### options?

###### autoTaggedKeywords?

`string`[]

###### baseUrl?

`string`

#### Returns

[`CreativeWork`](../../../types/Schema/type-aliases/CreativeWork.md)

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

### unmatchableAddonAudience()

> __unmatchableAddonAudience__(`metadata`): `string`[]

Defined in: src/managers/PageManager.ts:4117

The `addon:<slug>` entries on a page that can match nobody (#1964): the
slugs it names in `audience` or `access` that are not a loaded per-person
add-on. Such an entry still decides — it refuses everyone it would have
let in — so the author is told.

#### Parameters

##### metadata

`Partial`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)\> \| `null` \| `undefined`

The page's frontmatter

#### Returns

`string`[]

The slugs, in the order the page names them

***

### uuidHoldingName()

> __uuidHoldingName__(`field`, `name`, `ctx`): `string` \| `null`

Defined in: src/managers/PageManager.ts:3971

The uuid of the page that holds `name` as its title, or as its slug (#2140).

Whether a name is taken — the uniqueness question a save and the shipped
pages screen ask. An exact match, ignoring case, by the store's own rule
(the provider's `uuidHoldingName`); never the plural or fuzzy matching
`getPage` does for links, so "Reviews" is not held by "review".

#### Parameters

##### field

`"title"` \| `"slug"`

Which name: 'title' or 'slug'

##### name

`string`

The title or slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is asking

#### Returns

`string` \| `null`

The holder's uuid, or null when no page holds it
