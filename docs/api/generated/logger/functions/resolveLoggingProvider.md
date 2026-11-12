[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [logger](../README.md) / resolveLoggingProvider

# Function: resolveLoggingProvider()

> __resolveLoggingProvider__(`name`): [`default`](../../providers/BaseLoggingProvider/classes/default.md)

Defined in: src/utils/logger.ts:64

Resolve a provider name (e.g. `'fileloggingprovider'`) to an instance.
Unknown names fall back to FileLoggingProvider — logging must never fail
to initialize because of a misconfigured provider key.

## Parameters

### name

`string` \| `undefined`

Lowercase provider name from `ngdpbase.logging.provider`

## Returns

[`default`](../../providers/BaseLoggingProvider/classes/default.md)

A logging provider instance
