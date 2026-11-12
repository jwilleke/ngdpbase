[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/tlsConfig](../README.md) / TlsDeps

# Interface: TlsDeps

Defined in: src/utils/tlsConfig.ts:46

Injectable so the classification is testable without real certificates.

## Properties

### certExpiry?

> `optional` __certExpiry?__: (`cert`) => `string` \| `null`

Defined in: src/utils/tlsConfig.ts:51

ISO expiry of the certificate, or null when it cannot be read.

#### Parameters

##### cert

`Buffer`

#### Returns

`string` \| `null`

***

### createSecureContext?

> `optional` __createSecureContext?__: (`options`) => `unknown`

Defined in: src/utils/tlsConfig.ts:48

#### Parameters

##### options

###### cert

`Buffer`

###### key

`Buffer`

#### Returns

`unknown`

***

### now?

> `optional` __now?__: () => `Date`

Defined in: src/utils/tlsConfig.ts:49

#### Returns

`Date`

***

### readFile?

> `optional` __readFile?__: (`path`) => `Buffer`

Defined in: src/utils/tlsConfig.ts:47

#### Parameters

##### path

`string`

#### Returns

`Buffer`
