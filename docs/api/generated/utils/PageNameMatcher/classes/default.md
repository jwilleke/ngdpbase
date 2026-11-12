[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/PageNameMatcher](../README.md) / default

# Class: default

Defined in: src/utils/PageNameMatcher.ts:12

PageNameMatcher - Utility for matching page names with plural and case variations

Implements JSPWiki-style plural matching to allow flexible page name resolution.
For example, linking to "Page" will match both "Page" and "Pages".

## Example

```ts
const matcher = new PageNameMatcher(true);
matcher.findMatch('Page', ['Pages', 'Main']); // Returns 'Pages'
matcher.findMatch('Categories', ['Category']); // Returns 'Category'
```

## Constructors

### Constructor

> __new default__(`matchEnglishPlurals?`, `matchCamelCase?`): `PageNameMatcher`

Defined in: src/utils/PageNameMatcher.ts:24

Creates a new PageNameMatcher instance

#### Parameters

##### matchEnglishPlurals?

`boolean` = `true`

Enable plural matching (default: true)

##### matchCamelCase?

`boolean` = `false`

Enable CamelCase splitting/joining matching (default: false)

#### Returns

`PageNameMatcher`

## Methods

### buildIndex()

> __buildIndex__(`pageNames`): `void`

Defined in: src/utils/PageNameMatcher.ts:39

Build an index from page names for fast O(1) lookups
Call this once with all page names before doing many findMatch calls

Uses two passes so that exact page names always take priority over
plural/singular variants. Without this, "Plugin" would register "plugins"
as a variation and steal the index entry from the real "Plugins" page.

#### Parameters

##### pageNames

`string`[]

Array of all existing page names

#### Returns

`void`

***

### clearIndex()

> __clearIndex__(): `void`

Defined in: src/utils/PageNameMatcher.ts:62

Clear the index (call when page list changes)

#### Returns

`void`

***

### findConflict()

> __findConflict__(`newPageName`, `existingNames`): `string` \| `null`

Defined in: src/utils/PageNameMatcher.ts:271

Check if a page name conflicts with any existing pages (considering plurals)
Used when creating new pages to prevent creating "Click" when "Clicks" exists

#### Parameters

##### newPageName

`string`

The new page name to check

##### existingNames

`string`[]

Array of existing page names

#### Returns

`string` \| `null`

The conflicting page name, or null if no conflict

***

### findMatch()

> __findMatch__(`searchName`, `existingNames`): `string` \| `null`

Defined in: src/utils/PageNameMatcher.ts:213

Find a matching page name from a list of existing page names

#### Parameters

##### searchName

`string`

The page name to search for

##### existingNames

`string`[]

Array of existing page names (ignored if index is built)

#### Returns

`string` \| `null`

The matching page name, or null if not found

***

### getVariations()

> __getVariations__(`pageName`): `string`[]

Defined in: src/utils/PageNameMatcher.ts:114

Get all possible plural/singular variations of a page name

#### Parameters

##### pageName

`string`

The base page name

#### Returns

`string`[]

Array of possible variations (all lowercase)

***

### matches()

> __matches__(`name1`, `name2`): `boolean`

Defined in: src/utils/PageNameMatcher.ts:196

Check if two page names match (considering plurals and case)

#### Parameters

##### name1

`string`

First page name

##### name2

`string`

Second page name

#### Returns

`boolean`

True if the names match

***

### normalize()

> __normalize__(`pageName`): `string`

Defined in: src/utils/PageNameMatcher.ts:72

Normalize a page name for comparison (lowercase)

#### Parameters

##### pageName

`string`

The page name to normalize

#### Returns

`string`

Normalized page name
