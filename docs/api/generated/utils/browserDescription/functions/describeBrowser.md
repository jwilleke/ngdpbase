[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/browserDescription](../README.md) / describeBrowser

# Function: describeBrowser()

> __describeBrowser__(`userAgent`): `string` \| `null`

Defined in: src/utils/browserDescription.ts:11

# 1532 — a browser and the kind of device it runs on, in words a person
recognises ("Chrome on Windows"), from a User-Agent header. Used where a
person is asked to judge a request someone made: the sign-in approval
message and page. The rules are the ones `suggestedName()` in
`public/js/passkey.js` applies in the browser, so a passkey's suggested name
and an approval request describe the same device the same way.

Null when the header names neither a browser nor a device we know.

## Parameters

### userAgent

`string` \| `undefined`

## Returns

`string` \| `null`
