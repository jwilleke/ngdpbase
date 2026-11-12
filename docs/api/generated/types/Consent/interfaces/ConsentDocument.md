[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Consent](../README.md) / ConsentDocument

# Interface: ConsentDocument

Defined in: src/types/Consent.ts:73

A document a person is asked to accept, as it stands now: a page whose
front matter carries `version:` and `effective:`. Read from the page each
time, never copied.

## Properties

### effective

> __effective__: `string` \| `null`

Defined in: src/types/Consent.ts:82

The page's `effective:` date (`YYYY-MM-DD`), or null when it names none.

***

### id

> __id__: `string`

Defined in: src/types/Consent.ts:75

The page's slug, which is also the document's id in a record (`terms-of-service`, `phr-privacy-policy`).

***

### scope

> __scope__: `string`

Defined in: src/types/Consent.ts:76

***

### title

> __title__: `string`

Defined in: src/types/Consent.ts:78

The page's title, to show.

***

### version

> __version__: `string`

Defined in: src/types/Consent.ts:80

The page's `version:`, as a string. A change asks everyone again.
