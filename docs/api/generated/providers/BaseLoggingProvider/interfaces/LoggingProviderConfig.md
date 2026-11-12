[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseLoggingProvider](../README.md) / LoggingProviderConfig

# Interface: LoggingProviderConfig

Defined in: src/providers/BaseLoggingProvider.ts:32

Logger configuration passed to a provider when (re)building transports.
Mirrors module:logger.LoggerConfig.

## Properties

### dir?

> `optional` __dir?__: `string`

Defined in: src/providers/BaseLoggingProvider.ts:36

Log directory path — file transport is only added when this is set

***

### level?

> `optional` __level?__: `string`

Defined in: src/providers/BaseLoggingProvider.ts:34

Log level (error, warn, info, debug)

***

### maxFiles?

> `optional` __maxFiles?__: `number`

Defined in: src/providers/BaseLoggingProvider.ts:40

Max number of rotated log files

***

### maxSize?

> `optional` __maxSize?__: `string` \| `number`

Defined in: src/providers/BaseLoggingProvider.ts:38

Max log file size in bytes or string form (e.g. '1MB')
