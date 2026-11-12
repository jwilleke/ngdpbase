[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Consent](../README.md) / ConsentStatus

# Interface: ConsentStatus

Defined in: src/types/Consent.ts:133

One document's state for a person, for "Your consents" on /profile.

## Properties

### current

> __current__: [`ConsentRecord`](ConsentRecord.md) \| `null`

Defined in: src/types/Consent.ts:136

Their acceptance of the current version, or null: not accepted (never, or only an older version).

***

### document

> __document__: [`ConsentDocument`](ConsentDocument.md)

Defined in: src/types/Consent.ts:134

***

### latest

> __latest__: [`ConsentRecord`](ConsentRecord.md) \| `null`

Defined in: src/types/Consent.ts:138

Their latest acceptance of any version, or null.
