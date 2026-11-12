[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / canonicalPageName

# Function: canonicalPageName()

> __canonicalPageName__(`identifier`, `metadata`): `string`

Defined in: src/utils/privateStorePath.ts:365

The name a page an identifier opened is known by: its title — the
identifier may be a uuid or slug, and every downstream index is keyed by
title — or, for a vault page, its vault name (#1539). A vault page's bare
title is a PUBLIC page's name, so the door would judge, and a write would
hit, a different page.

## Parameters

### identifier

`string`

### metadata

\{ `title?`: `string`; \} \| `null` \| `undefined`

## Returns

`string`
