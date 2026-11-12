[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / approvalSentence

# Function: approvalSentence()

> __approvalSentence__(`about`, `strong?`, `text?`): `string`

Defined in: src/managers/AuthManager.ts:440

The approval sentence (#1532, decided wording plus the IP and place):
"A sign-in request for Willeke Family was sent at 2 Oct 2026, 14:02 EDT
from Chrome on Windows at IP address 81.2.69.160, near Columbus, United
States." `strong` marks the site and time, `text` every other value; for
HTML both escape.

## Parameters

### about

[`ApprovalAbout`](../interfaces/ApprovalAbout.md)

### strong?

(`v`) => `string`

### text?

(`v`) => `string`

## Returns

`string`
