[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/httpsRedirect](../README.md) / isTlsClientHello

# Function: isTlsClientHello()

> __isTlsClientHello__(`first`): `boolean`

Defined in: src/utils/httpsRedirect.ts:41

Did the client open with TLS?

An empty read is treated as TLS. The alternative — assuming plaintext and
answering with a redirect — would break a real HTTPS connection, and this
feature must never be able to do that: serving the redirect is a
convenience, serving TLS is the point.

## Parameters

### first

`Buffer`

## Returns

`boolean`
