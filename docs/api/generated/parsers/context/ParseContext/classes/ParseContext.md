[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/context/ParseContext](../README.md) / ParseContext

# Class: ParseContext

Defined in: src/parsers/context/ParseContext.ts:261

ParseContext - Context object for markup parsing operations

# 629 Pass 2: holds a non-nullable reference to a WikiContextLike. For HTTP
requests this is the actual WikiContext (passed through toParseOptions);
for tests / direct construction it's a synthesized stub from the supplied
PageContext. Consumers should always read user/page-data via
`parseContext.wikiContext.X` — the duplicating getters from Pass 1
(pageName / userContext / pageMetadata) have been removed.

Helpers that derive (not duplicate) from wikiContext are still here:
userName, isAuthenticated, getUserRoles.

## Constructors

### Constructor

> __new ParseContext__(`content`, `context`, `engine`): `ParseContext`

Defined in: src/parsers/context/ParseContext.ts:328

#### Parameters

##### content

`string`

##### context

[`ParseContextOptions`](../type-aliases/ParseContextOptions.md)

##### engine

[`WikiEngine`](../interfaces/WikiEngine.md)

#### Returns

`ParseContext`

## Properties

### cacheDependencies

> `readonly` __cacheDependencies__: [`default`](../../../../cache/CacheDependencies/classes/default.md) \| `null`

Defined in: src/parsers/context/ParseContext.ts:323

# 1751: the page cache's record of what this render reads. Plugins reach it
through `context.dependsOn(topic)` (PluginManager.execute). Null when the
page is not being cached.

***

### engine

> `readonly` __engine__: [`WikiEngine`](../interfaces/WikiEngine.md)

Defined in: src/parsers/context/ParseContext.ts:264

***

### handlerResults

> __handlerResults__: `Map`\<`string`, `unknown`\>

Defined in: src/parsers/context/ParseContext.ts:314

***

### metadata

> __metadata__: `Record`\<`string`, `unknown`\>

Defined in: src/parsers/context/ParseContext.ts:315

***

### originalContent

> `readonly` __originalContent__: `string`

Defined in: src/parsers/context/ParseContext.ts:262

***

### pageContext

> `readonly` __pageContext__: [`PageContext`](../interfaces/PageContext.md)

Defined in: src/parsers/context/ParseContext.ts:263

***

### pageOwner

> __pageOwner__: `string` \| `null`

Defined in: src/parsers/context/ParseContext.ts:300

The username of a public page's author, when the author is stored as an
identity

#### Id

(#2097): what a `[store/Title]` link on it resolves in.
Resolved once per parse by MarkupParser; null when not needed.

***

### privateLinkTitles

> __privateLinkTitles__: `Map`\<`string`, `Set`\<`string`\>\> \| `null`

Defined in: src/parsers/context/ParseContext.ts:293

The private titles this reader can see in the page owner's stores, by
store id (#1457) — what a `[store/Title]` link on a PRIVATE page is
resolved against, so the owner of a page that is not there gets a red
link to its editor.

`null` when the question does not arise: a public page, whose HTML is
cached and shared by role and so has one appearance for everyone, or a
page with no such link in it. A store that is ABSENT from the map is one
this reader cannot open — not one without the page.

Resolved once per parse by MarkupParser, never per link.

***

### protectedBlocks

> __protectedBlocks__: `unknown`[]

Defined in: src/parsers/context/ParseContext.ts:311

***

### protectHtml

> __protectHtml__: ((`html`) => `string`) \| `null`

Defined in: src/parsers/context/ParseContext.ts:308

Hand finished HTML from a syntax handler to MarkupParser; write the
returned placeholder into the content instead (#1623). The HTML is merged
after markdown-it, so it is not mistaken for HTML the author typed and
held to the author HTML policy. `null` outside a MarkupParser parse.

***

### requestInfo

> `readonly` __requestInfo__: [`RequestInfo`](../interfaces/RequestInfo.md) \| `null`

Defined in: src/parsers/context/ParseContext.ts:278

Request info. Built from request headers by toParseOptions; not
duplicated from wikiContext (the stub lacks the headers anyway).
Static after construction.

***

### syntaxTokens

> __syntaxTokens__: `unknown`[]

Defined in: src/parsers/context/ParseContext.ts:312

***

### variables

> __variables__: `Map`\<`string`, `unknown`\>

Defined in: src/parsers/context/ParseContext.ts:313

***

### wikiContext

> `readonly` __wikiContext__: [`WikiContextLike`](../interfaces/WikiContextLike.md)

Defined in: src/parsers/context/ParseContext.ts:271

Reference to the parent WikiContext (#629). Always non-null after
construction — for callers without a real WikiContext, a stub is
synthesized from the PageContext snapshot.

## Accessors

### userName

#### Get Signature

> __get__ __userName__(): `string`

Defined in: src/parsers/context/ParseContext.ts:375

Caller's username — derivation helper over `wikiContext.userContext`.
Returns 'anonymous' when no userContext is bound.

##### Returns

`string`

## Methods

### clone()

> __clone__(`overrides?`): `ParseContext`

Defined in: src/parsers/context/ParseContext.ts:497

Clone context for sub-processing

#### Parameters

##### overrides?

`Partial`\<[`PageContext`](../interfaces/PageContext.md)\> = `{}`

Properties to override

#### Returns

`ParseContext`

New context instance

***

### createErrorContext()

> __createErrorContext__(`error`, `phase`): [`ParseErrorContext`](../interfaces/ParseErrorContext.md)

Defined in: src/parsers/context/ParseContext.ts:534

Create error context for debugging

#### Parameters

##### error

`Error`

Error that occurred

##### phase

`string`

Phase where error occurred

#### Returns

[`ParseErrorContext`](../interfaces/ParseErrorContext.md)

Error context

***

### exportForCache()

> __exportForCache__(): [`CachedContextData`](../interfaces/CachedContextData.md)

Defined in: src/parsers/context/ParseContext.ts:568

Export context data for caching

#### Returns

[`CachedContextData`](../interfaces/CachedContextData.md)

Serializable context data

***

### getHandlerResult()

> __getHandlerResult__(`handlerId`): `unknown`

Defined in: src/parsers/context/ParseContext.ts:438

Get handler result

#### Parameters

##### handlerId

`string`

Handler identifier

#### Returns

`unknown`

Handler result or null

***

### getManager()

> __getManager__(`managerName`): `unknown`

Defined in: src/parsers/context/ParseContext.ts:385

Get manager instance from engine

#### Parameters

##### managerName

`string`

Name of manager to retrieve

#### Returns

`unknown`

Manager instance or null

***

### getMetadata()

> __getMetadata__(`key`, `defaultValue?`): `unknown`

Defined in: src/parsers/context/ParseContext.ts:460

Get metadata value

#### Parameters

##### key

`string`

Metadata key

##### defaultValue?

`unknown` = `null`

Default value if not found

#### Returns

`unknown`

Metadata value

***

### getPhaseTiming()

> __getPhaseTiming__(`phaseName`): `number`

Defined in: src/parsers/context/ParseContext.ts:480

Get phase timing

#### Parameters

##### phaseName

`string`

Name of phase

#### Returns

`number`

Duration in milliseconds or 0

***

### getSummary()

> __getSummary__(): [`ContextSummary`](../interfaces/ContextSummary.md)

Defined in: src/parsers/context/ParseContext.ts:550

Get context summary for logging

#### Returns

[`ContextSummary`](../interfaces/ContextSummary.md)

Context summary

***

### getTotalTime()

> __getTotalTime__(): `number`

Defined in: src/parsers/context/ParseContext.ts:488

Get total processing time

#### Returns

`number`

Total time in milliseconds

***

### getUserRoles()

> __getUserRoles__(): `string`[]

Defined in: src/parsers/context/ParseContext.ts:399

Get user roles — derivation helper over `wikiContext.userContext`.

#### Returns

`string`[]

***

### getVariable()

> __getVariable__(`name`, `defaultValue?`): `unknown`

Defined in: src/parsers/context/ParseContext.ts:418

Get variable value

#### Parameters

##### name

`string`

Variable name

##### defaultValue?

`unknown` = `null`

Default value if not found

#### Returns

`unknown`

Variable value

***

### importFromCache()

> __importFromCache__(`data`): `void`

Defined in: src/parsers/context/ParseContext.ts:588

Import context data from cache

#### Parameters

##### data

[`CachedContextData`](../interfaces/CachedContextData.md)

Cached context data

#### Returns

`void`

***

### isAuthenticated()

> __isAuthenticated__(): `boolean`

Defined in: src/parsers/context/ParseContext.ts:392

Check if user is authenticated — derivation helper over `wikiContext.userContext`.

#### Returns

`boolean`

***

### recordPhaseTiming()

> __recordPhaseTiming__(`phaseName`, `duration`): `void`

Defined in: src/parsers/context/ParseContext.ts:471

Record phase timing

#### Parameters

##### phaseName

`string`

Name of phase

##### duration

`number`

Duration in milliseconds

#### Returns

`void`

***

### setHandlerResult()

> __setHandlerResult__(`handlerId`, `result`): `void`

Defined in: src/parsers/context/ParseContext.ts:429

Store handler result

#### Parameters

##### handlerId

`string`

Handler identifier

##### result

`unknown`

Handler result

#### Returns

`void`

***

### setMetadata()

> __setMetadata__(`key`, `value`): `void`

Defined in: src/parsers/context/ParseContext.ts:449

Set metadata value

#### Parameters

##### key

`string`

Metadata key

##### value

`unknown`

Metadata value

#### Returns

`void`

***

### setVariable()

> __setVariable__(`name`, `value`): `void`

Defined in: src/parsers/context/ParseContext.ts:408

Set variable value

#### Parameters

##### name

`string`

Variable name

##### value

`unknown`

Variable value

#### Returns

`void`
