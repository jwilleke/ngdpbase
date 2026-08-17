[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/parsers/LinkParser](../README.md) / LinkParser

# Class: LinkParser

Defined in: [src/parsers/LinkParser.ts:189](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L189)

Main LinkParser class

## Constructors

### Constructor

> __new LinkParser__(`options?`): `LinkParser`

Defined in: [src/parsers/LinkParser.ts:211](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L211)

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

Defined in: [src/parsers/LinkParser.ts:200](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L200)

InterWiki sites configuration

***

### linkPattern

> __linkPattern__: `RegExp`

Defined in: [src/parsers/LinkParser.ts:203](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L203)

Link pattern regex

***

### options

> __options__: [`LinkParserOptions`](../interfaces/LinkParserOptions.md)

Defined in: [src/parsers/LinkParser.ts:191](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L191)

Parser configuration options

***

### pageNameMatcher

> __pageNameMatcher__: [`default`](../../../utils/PageNameMatcher/classes/default.md) \| `null`

Defined in: [src/parsers/LinkParser.ts:197](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L197)

Page name matcher for fuzzy matching

***

### pageNames

> __pageNames__: `Set`\<`string`\>

Defined in: [src/parsers/LinkParser.ts:194](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L194)

Cache of available page names

## Methods

### addPageName()

> __addPageName__(`pageName`): `void`

Defined in: [src/parsers/LinkParser.ts:277](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L277)

Add a page name to the known pages

#### Parameters

##### pageName

`string`

Page name to add

#### Returns

`void`

***

### buildAttributeString()

> __buildAttributeString__(`customAttributes`, `defaultAttributes`): `string`

Defined in: [src/parsers/LinkParser.ts:619](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L619)

Build HTML attribute string

#### Parameters

##### customAttributes

[`LinkAttributes`](../interfaces/LinkAttributes.md) = `{}`

Custom attributes from link

##### defaultAttributes

`Record`\<`string`, `string` \| `undefined`\> = `{}`

Default attributes

#### Returns

`string`

HTML attribute string

***

### determineLinkType()

> __determineLinkType__(`link`): [`LinkType`](../type-aliases/LinkType.md)

Defined in: [src/parsers/LinkParser.ts:445](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L445)

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

Defined in: [src/parsers/LinkParser.ts:690](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L690)

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

Defined in: [src/parsers/LinkParser.ts:337](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L337)

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

Defined in: [src/parsers/LinkParser.ts:602](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L602)

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

Defined in: [src/parsers/LinkParser.ts:585](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L585)

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

Defined in: [src/parsers/LinkParser.ts:526](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L526)

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

Defined in: [src/parsers/LinkParser.ts:487](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L487)

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

Defined in: [src/parsers/LinkParser.ts:550](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L550)

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

Defined in: [src/parsers/LinkParser.ts:420](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L420)

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

Defined in: [src/parsers/LinkParser.ts:707](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L707)

Get parser statistics

#### Returns

[`ParserStats`](../interfaces/ParserStats.md)

Parser statistics

***

### isUrlSafe()

> __isUrlSafe__(`url`): `boolean`

Defined in: [src/parsers/LinkParser.ts:641](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L641)

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

Defined in: [src/parsers/LinkParser.ts:370](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L370)

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

> __parseLinks__(`content`, `context`): `string`

Defined in: [src/parsers/LinkParser.ts:301](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L301)

Parse all links in the given content

#### Parameters

##### content

`string`

Content containing wiki links

##### context

[`ParserContext`](../interfaces/ParserContext.md) = `{}`

Parsing context (pageName, etc.)

#### Returns

`string`

Content with links converted to HTML

***

### sanitizeAttributeValue()

> __sanitizeAttributeValue__(`value`): `string`

Defined in: [src/parsers/LinkParser.ts:679](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L679)

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

Defined in: [src/parsers/LinkParser.ts:666](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L666)

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

Defined in: [src/parsers/LinkParser.ts:287](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L287)

Set InterWiki sites configuration

#### Parameters

##### sites

InterWiki sites configuration

`Map`\<`string`, [`InterWikiSiteConfig`](../interfaces/InterWikiSiteConfig.md)\> | `Record`\<`string`, [`InterWikiSiteConfig`](../interfaces/InterWikiSiteConfig.md)\>

#### Returns

`void`

***

### setPageNames()

> __setPageNames__(`pageNames`, `matchEnglishPlurals`): `void`

Defined in: [src/parsers/LinkParser.ts:268](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/LinkParser.ts#L268)

Set the list of existing wiki page names for link validation

#### Parameters

##### pageNames

`string`[]

Array of page names

##### matchEnglishPlurals

`boolean` = `true`

Enable plural matching (default: true)

#### Returns

`void`
