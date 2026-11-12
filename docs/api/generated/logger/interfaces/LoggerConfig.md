[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [logger](../README.md) / LoggerConfig

# Interface: LoggerConfig

Defined in: src/utils/logger.ts:30

Logger configuration options

## Properties

### dir?

> `optional` __dir?__: `string`

Defined in: src/utils/logger.ts:34

Log directory path

***

### level?

> `optional` __level?__: `string`

Defined in: src/utils/logger.ts:32

Log level (error, warn, info, debug)

***

### maxFiles?

> `optional` __maxFiles?__: `number`

Defined in: src/utils/logger.ts:38

Max number of rotated log files

***

### maxSize?

> `optional` __maxSize?__: `string` \| `number`

Defined in: src/utils/logger.ts:36

Max log file size in bytes or string format (e.g., '1MB')
