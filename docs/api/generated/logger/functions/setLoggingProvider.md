[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [logger](../README.md) / setLoggingProvider

# Function: setLoggingProvider()

> __setLoggingProvider__(`provider`): `void`

Defined in: src/utils/logger.ts:83

Set the active logging provider. Called by WikiEngine after
ConfigurationManager resolves `ngdpbase.logging.provider`. Does not rebuild
the running logger on its own — [reconfigureLogger](reconfigureLogger.md) does that.

## Parameters

### provider

[`default`](../../providers/BaseLoggingProvider/classes/default.md)

The provider instance to activate

## Returns

`void`
