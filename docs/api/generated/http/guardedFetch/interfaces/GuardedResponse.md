[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/guardedFetch](../README.md) / GuardedResponse

# Interface: GuardedResponse

Defined in: src/http/guardedFetch.ts:83

## Properties

### body

> __body__: `Buffer`

Defined in: src/http/guardedFetch.ts:86

***

### chain

> __chain__: `string`[]

Defined in: src/http/guardedFetch.ts:90

Every URL in the chain. A redirect is a disclosure of where you went.

***

### finalUrl

> __finalUrl__: `string`

Defined in: src/http/guardedFetch.ts:88

Where the response actually came from, after redirects.

***

### headers

> __headers__: `Record`\<`string`, `string` \| `string`[] \| `undefined`\>

Defined in: src/http/guardedFetch.ts:85

***

### status

> __status__: `number`

Defined in: src/http/guardedFetch.ts:84
