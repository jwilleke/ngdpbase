[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/httpsRedirect](../README.md) / MultiplexDeps

# Interface: MultiplexDeps

Defined in: src/utils/httpsRedirect.ts:199

## Properties

### onError?

> `optional` __onError?__: (`err`) => `void`

Defined in: src/utils/httpsRedirect.ts:204

#### Parameters

##### err

`Error`

#### Returns

`void`

***

### plain

> __plain__: `object`

Defined in: src/utils/httpsRedirect.ts:203

Receives sockets that opened with anything else.

#### emit

> __emit__: (`event`, `socket`) => `boolean`

##### Parameters

###### event

`"connection"`

###### socket

`Socket`

##### Returns

`boolean`

***

### tls

> __tls__: `object`

Defined in: src/utils/httpsRedirect.ts:201

Receives sockets that opened with a TLS handshake.

#### emit

> __emit__: (`event`, `socket`) => `boolean`

##### Parameters

###### event

`"connection"`

###### socket

`Socket`

##### Returns

`boolean`
