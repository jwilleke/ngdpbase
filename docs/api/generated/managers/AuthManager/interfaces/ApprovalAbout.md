[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / ApprovalAbout

# Interface: ApprovalAbout

Defined in: src/managers/AuthManager.ts:411

What an approval request says about a waiting sign-in (#1532): one source
for the message and the page.

## Extended by

- [`ApprovalDetails`](ApprovalDetails.md)

## Properties

### device

> __device__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:417

"Chrome on Windows", or null when the browser could not be named.

***

### ip?

> `optional` __ip?__: `string`

Defined in: src/managers/AuthManager.ts:419

The IP address it came from (Express's `req.ip`, so `trust-proxy` applies).

***

### location

> __location__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:421

Roughly where ("Columbus, United States"), or null when no source says.

***

### site

> __site__: `string`

Defined in: src/managers/AuthManager.ts:413

The site's name (`ngdpbase.application-name`).

***

### when

> __when__: `string`

Defined in: src/managers/AuthManager.ts:415

When it was asked, in the account holder's own time zone.
