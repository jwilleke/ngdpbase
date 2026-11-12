[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionAccount](../README.md) / checkSessionAccount

# Function: checkSessionAccount()

> __checkSessionAccount__(`stored`, `account`): \{ `end`: [`AccountEndReason`](../type-aliases/AccountEndReason.md); \} \| \{ `bind?`: `string`; `end`: `null`; \}

Defined in: src/utils/sessionAccount.ts:38

What one request (or the sweep) does to a signed-in session, given its
account as stored now (null when there is none). `bind` is set on a session
signed in before the binding existed that still belongs to its account: the
caller writes it to `accountCreatedAt`, once.

## Parameters

### stored

`Record`\<`string`, `unknown`\> \| `SessionLike`

### account

`AccountLike` \| `null` \| `undefined`

## Returns

\{ `end`: [`AccountEndReason`](../type-aliases/AccountEndReason.md); \} \| \{ `bind?`: `string`; `end`: `null`; \}
