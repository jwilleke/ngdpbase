[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [ice/shims/record](../README.md) / RecordShimOptions

# Interface: RecordShimOptions

Defined in: src/ice/shims/record.ts:36

A record shim's options (#2109): the site's `ngdpbase.import.shims.<id>.options`,
with the run's own over them (a feed source's settings, an import's).
Each is optional and generic: where the items are, which field is the id,
a field map, and the few format settings (CSV's delimiter and preamble, an
index's links).

## Properties

### delimiter?

> `optional` __delimiter?__: `string`

Defined in: src/ice/shims/record.ts:44

csv: the field delimiter. Default ','.

***

### itemsPath?

> `optional` __itemsPath?__: `string`

Defined in: src/ice/shims/record.ts:42

Dot-path to the items array (rest-json, xml, rss-atom, xml-index).

***

### linkPattern?

> `optional` __linkPattern?__: `string`

Defined in: src/ice/shims/record.ts:48

xml-index: a regex matched against the index's hrefs.

***

### map?

> `optional` __map?__: `Record`\<`string`, `string`\>

Defined in: src/ice/shims/record.ts:40

Dot-path map: property → source path.

***

### maxItems?

> `optional` __maxItems?__: `number`

Defined in: src/ice/shims/record.ts:50

xml-index: the most item documents fetched in one run.

***

### recordIdField?

> `optional` __recordIdField?__: `string`

Defined in: src/ice/shims/record.ts:38

Dot-path to each item's id.

***

### skipLines?

> `optional` __skipLines?__: `number`

Defined in: src/ice/shims/record.ts:46

csv: lines skipped before the header (#1102). Default 0.
