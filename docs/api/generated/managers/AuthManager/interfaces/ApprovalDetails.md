[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / ApprovalDetails

# Interface: ApprovalDetails

Defined in: src/managers/AuthManager.ts:425

What the approval page shows about a waiting sign-in (#1532).

## Extends

- [`ApprovalAbout`](ApprovalAbout.md)

## Properties

### device

> __device__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:417

"Chrome on Windows", or null when the browser could not be named.

#### Inherited from

[`ApprovalAbout`](ApprovalAbout.md).[`device`](ApprovalAbout.md#device)

***

### ip?

> `optional` __ip?__: `string`

Defined in: src/managers/AuthManager.ts:419

The IP address it came from (Express's `req.ip`, so `trust-proxy` applies).

#### Inherited from

[`ApprovalAbout`](ApprovalAbout.md).[`ip`](ApprovalAbout.md#ip)

***

### location

> __location__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:421

Roughly where ("Columbus, United States"), or null when no source says.

#### Inherited from

[`ApprovalAbout`](ApprovalAbout.md).[`location`](ApprovalAbout.md#location)

***

### requestedAt

> __requestedAt__: `number`

Defined in: src/managers/AuthManager.ts:427

***

### sentenceHtml

> __sentenceHtml__: `string`

Defined in: src/managers/AuthManager.ts:430

The sentence the message says, as HTML with every value escaped.

***

### site

> __site__: `string`

Defined in: src/managers/AuthManager.ts:413

The site's name (`ngdpbase.application-name`).

#### Inherited from

[`ApprovalAbout`](ApprovalAbout.md).[`site`](ApprovalAbout.md#site)

***

### userAgent?

> `optional` __userAgent?__: `string`

Defined in: src/managers/AuthManager.ts:428

***

### username

> __username__: `string`

Defined in: src/managers/AuthManager.ts:426

***

### when

> __when__: `string`

Defined in: src/managers/AuthManager.ts:415

When it was asked, in the account holder's own time zone.

#### Inherited from

[`ApprovalAbout`](ApprovalAbout.md).[`when`](ApprovalAbout.md#when)
