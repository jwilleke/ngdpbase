[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageVersionToken](../README.md) / isStaleSave

# Function: isStaleSave()

> __isStaleSave__(`submittedBase`, `currentToken`): `boolean`

Defined in: src/utils/pageVersionToken.ts:86

Was this save built on a version of the page that has since moved?

Best-effort by design. It returns false — allow the save — whenever it cannot
be sure, and each of those cases is a deliberate choice rather than an
oversight:

- __The client sent no base token.__ API callers, older cached forms, and any
  surface that has not been taught to send one. Refusing them would turn a
  data-loss fix into an outage for callers that never had the problem
  reported against them. The trade is stated plainly: a client that does not
  participate is not protected.
- __The page has no current token.__ Nothing to compare; see
  [versionTokenOf](versionTokenOf.md).
- __The page does not exist yet.__ A create cannot conflict with itself.

## Parameters

### submittedBase

`string` \| `null` \| `undefined`

token the editor was handed when it loaded the page

### currentToken

`string` \| `null` \| `undefined`

token of the page as it stands on disk right now

## Returns

`boolean`
