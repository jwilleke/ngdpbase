[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Consent](../README.md) / ConsentRecord

# Interface: ConsentRecord

Defined in: src/types/Consent.ts:97

One acceptance, or its withdrawal, one line of the person's file.
Append-only: a later version is a later line, and a withdrawal is a later
`withdraw` line naming the same document, version and subject; nothing is
rewritten.

## Properties

### acceptedAt

> __acceptedAt__: `string`

Defined in: src/types/Consent.ts:104

ISO 8601 time the person accepted (on a `withdraw` line, of the acceptance withdrawn).

***

### account?

> `optional` __account?__: `string`

Defined in: src/types/Consent.ts:111

The account this was accepted on, by its creation time (#1937): a later
account that takes the same username never inherits it.

***

### context

> __context__: `object`

Defined in: src/types/Consent.ts:124

Who and how: the account, where from, and the way they were asked
(`sign-up`, `sign-in`, `add-on`; for the recovery words `store-door`,
`reminder`, and `new-words` once #1925 makes a new set; for the
shared-folders words `setup` and `reminder`).

#### by

> __by__: `string`

#### how

> __how__: `string`

#### ipAddress?

> `optional` __ipAddress?__: `string`

#### origin

> __origin__: `string`

***

### document

> __document__: `string`

Defined in: src/types/Consent.ts:99

***

### effective

> __effective__: `string` \| `null`

Defined in: src/types/Consent.ts:102

***

### kind

> __kind__: `"accept"` \| `"withdraw"`

Defined in: src/types/Consent.ts:98

***

### scope

> __scope__: `string`

Defined in: src/types/Consent.ts:100

***

### subject?

> `optional` __subject?__: `string`

Defined in: src/types/Consent.ts:117

What the acceptance is about, in a scope bound to a subject (#1928): for
the recovery words, which set of words (`recoveryWordsId`). Absent
elsewhere. A new subject (a new set of words) asks again.

***

### version

> __version__: `string`

Defined in: src/types/Consent.ts:101

***

### withdrawnAt?

> `optional` __withdrawnAt?__: `string`

Defined in: src/types/Consent.ts:106

ISO 8601 time it was withdrawn; on a `withdraw` line only.
