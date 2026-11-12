[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/LinkParser](../README.md) / LinkParser

# Class: LinkParser

Defined in: src/parsers/LinkParser.ts:353

Main LinkParser class

## Constructors

### Constructor

> __new LinkParser__(`options?`): `LinkParser`

Defined in: src/parsers/LinkParser.ts:375

Create a new LinkParser instance

#### Parameters

##### options?

`Partial`\<[`LinkParserOptions`](../interfaces/LinkParserOptions.md)\> = `{}`

Configuration options

#### Returns

`LinkParser`

## Properties

### interWikiSites

> __interWikiSites__: `Map`\<`string`, [`InterWikiSiteConfig`](../interfaces/InterWikiSiteConfig.md)\>

Defined in: src/parsers/LinkParser.ts:364

InterWiki sites configuration

***

### linkPattern

> __linkPattern__: `RegExp`

Defined in: src/parsers/LinkParser.ts:367

Link pattern regex

***

### options

> __options__: [`LinkParserOptions`](../interfaces/LinkParserOptions.md)

Defined in: src/parsers/LinkParser.ts:355

Parser configuration options

***

### pageNameMatcher

> __pageNameMatcher__: [`default`](../../../utils/PageNameMatcher/classes/default.md) \| `null`

Defined in: src/parsers/LinkParser.ts:361

Page name matcher for fuzzy matching

***

### pageNames

> __pageNames__: `Set`\<`string`\>

Defined in: src/parsers/LinkParser.ts:358

Cache of available page names

## Methods

### addPageName()

> __addPageName__(`pageName`): `void`

Defined in: src/parsers/LinkParser.ts:436

Add a page name to the known pages

#### Parameters

##### pageName

`string`

Page name to add

#### Returns

`void`

***

### buildAttributeString()

> __buildAttributeString__(`customAttributes?`, `defaultAttributes?`): `string`

Defined in: src/parsers/LinkParser.ts:791

Build HTML attribute string

#### Parameters

##### customAttributes?

[`LinkAttributes`](../interfaces/LinkAttributes.md) = `{}`

Custom attributes from link

##### defaultAttributes?

`Record`\<`string`, `string` \| `undefined`\> = `{}`

Default attributes

#### Returns

`string`

HTML attribute string

***

### determineLinkType()

> __determineLinkType__(`link`): [`LinkType`](../type-aliases/LinkType.md)

Defined in: src/parsers/LinkParser.ts:606

Determine the type of link

#### Parameters

##### link

[`Link`](Link.md)

Link object

#### Returns

[`LinkType`](../type-aliases/LinkType.md)

Link type

***

### escapeHtml()

> __escapeHtml__(`text`): `string`

Defined in: src/parsers/LinkParser.ts:862

Escape HTML characters

#### Parameters

##### text

`string`

Text to escape

#### Returns

`string`

Escaped text

***

### findLinks()

> __findLinks__(`content`): [`Link`](Link.md)[]

Defined in: src/parsers/LinkParser.ts:496

Find all links in the content

#### Parameters

##### content

`string`

Content to search

#### Returns

[`Link`](Link.md)[]

Array of Link objects

***

### generateAnchorLink()

> __generateAnchorLink__(`link`, `_context`): `string`

Defined in: src/parsers/LinkParser.ts:774

Generate HTML for anchor links

#### Parameters

##### link

[`Link`](Link.md)

Link object

##### \_context

[`ParserContext`](../interfaces/ParserContext.md)

Parsing context (unused)

#### Returns

`string`

HTML link

***

### generateEmailLink()

> __generateEmailLink__(`link`, `_context`): `string`

Defined in: src/parsers/LinkParser.ts:757

Generate HTML for email links

#### Parameters

##### link

[`Link`](Link.md)

Link object

##### \_context

[`ParserContext`](../interfaces/ParserContext.md)

Parsing context (unused)

#### Returns

`string`

HTML link

***

### generateExternalLink()

> __generateExternalLink__(`link`, `_context`): `string`

Defined in: src/parsers/LinkParser.ts:698

Generate HTML for external links

#### Parameters

##### link

[`Link`](Link.md)

Link object

##### \_context

[`ParserContext`](../interfaces/ParserContext.md)

Parsing context (unused)

#### Returns

`string`

HTML link

***

### generateInternalLink()

> __generateInternalLink__(`link`, `_context`): `string`

Defined in: src/parsers/LinkParser.ts:648

Generate HTML for internal wiki links

#### Parameters

##### link

[`Link`](Link.md)

Link object

##### \_context

[`ParserContext`](../interfaces/ParserContext.md)

Parsing context (unused)

#### Returns

`string`

HTML link

***

### generateInterWikiLink()

> __generateInterWikiLink__(`link`, `_context`): `string`

Defined in: src/parsers/LinkParser.ts:722

Generate HTML for InterWiki links

#### Parameters

##### link

[`Link`](Link.md)

Link object

##### \_context

[`ParserContext`](../interfaces/ParserContext.md)

Parsing context (unused)

#### Returns

`string`

HTML link

***

### generateLinkHtml()

> __generateLinkHtml__(`link`, `context`): `string`

Defined in: src/parsers/LinkParser.ts:581

Generate HTML for a link

#### Parameters

##### link

[`Link`](Link.md)

Link object to process

##### context

[`ParserContext`](../interfaces/ParserContext.md)

Parsing context

#### Returns

`string`

HTML link

***

### getStats()

> __getStats__(): [`ParserStats`](../interfaces/ParserStats.md)

Defined in: src/parsers/LinkParser.ts:879

Get parser statistics

#### Returns

[`ParserStats`](../interfaces/ParserStats.md)

Parser statistics

***

### isUrlSafe()

> __isUrlSafe__(`url`): `boolean`

Defined in: src/parsers/LinkParser.ts:813

Validate URL safety

#### Parameters

##### url

`string`

URL to validate

#### Returns

`boolean`

True if URL is safe

***

### parseAttributes()

> __parseAttributes__(`attributeString`): [`LinkAttributes`](../interfaces/LinkAttributes.md)

Defined in: src/parsers/LinkParser.ts:531

Parse link attributes from attribute string

#### Parameters

##### attributeString

`string`

String containing attributes

#### Returns

[`LinkAttributes`](../interfaces/LinkAttributes.md)

Parsed attributes object

***

### parseLinks()

> __parseLinks__(`content`, `context?`): `string`

Defined in: src/parsers/LinkParser.ts:460

Parse all links in the given content

#### Parameters

##### content

`string`

Content containing wiki links

##### context?

[`ParserContext`](../interfaces/ParserContext.md) = `{}`

Parsing context (pageName, etc.)

#### Returns

`string`

Content with links converted to HTML

***

### sanitizeAttributeValue()

> __sanitizeAttributeValue__(`value`): `string`

Defined in: src/parsers/LinkParser.ts:851

Sanitize attribute value to prevent XSS

#### Parameters

##### value

`string`

Attribute value

#### Returns

`string`

Sanitized value

***

### sanitizeStyleAttribute()

> __sanitizeStyleAttribute__(`style`): `string`

Defined in: src/parsers/LinkParser.ts:838

Sanitize style attribute value

#### Parameters

##### style

`string`

Style value

#### Returns

`string`

Sanitized style

***

### setInterWikiSites()

> __setInterWikiSites__(`sites`): `void`

Defined in: src/parsers/LinkParser.ts:446

Set InterWiki sites configuration

#### Parameters

##### sites

`Map`\<`string`, [`InterWikiSiteConfig`](../interfaces/InterWikiSiteConfig.md)\> \| `Record`\<`string`, [`InterWikiSiteConfig`](../interfaces/InterWikiSiteConfig.md)\>

InterWiki sites configuration

#### Returns

`void`

***

### setPageNames()

> __setPageNames__(`pageNames`, `matchEnglishPlurals?`, `matchCamelCase?`): `void`

Defined in: src/parsers/LinkParser.ts:427

Set the list of existing wiki page names for link validation

#### Parameters

##### pageNames

`string`[]

Array of page names

##### matchEnglishPlurals?

`boolean` = `true`

Enable plural matching (default: true)

##### matchCamelCase?

`boolean` = `false`

Enable CamelCase matching (default: false)

#### Returns

`void`
