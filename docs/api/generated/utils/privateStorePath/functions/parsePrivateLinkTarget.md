[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / parsePrivateLinkTarget

# Function: parsePrivateLinkTarget()

> __parsePrivateLinkTarget__(`target`): \{ `store`: `string`; `title`: `string`; \} \| `null`

Defined in: src/utils/privateStorePath.ts:381

A private page's LINK target, written inside brackets as `{store}/{Title}`
(#1457). The store belongs to the owner of the page the link sits in, so the
target names no user — [formatPrivatePageName](formatPrivatePageName.md) supplies the owner.

`null` for anything else, including a target whose first segment is not a
store id (`Docs/Setup`) and one with a second `/`: titles never contain one
(#1455), so a deeper path is not a private page.

## Parameters

### target

`string`

## Returns

\{ `store`: `string`; `title`: `string`; \} \| `null`
