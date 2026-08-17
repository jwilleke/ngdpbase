[__ngdpbase API v1.5.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [logger](../README.md) / LoggerConfig

# Interface: LoggerConfig

Defined in: [src/utils/logger.ts:21](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/logger.ts#L21)

Logger configuration options

## Properties

### dir?

> `optional` __dir__: `string`

Defined in: [src/utils/logger.ts:25](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/logger.ts#L25)

Log directory path

***

### level?

> `optional` __level__: `string`

Defined in: [src/utils/logger.ts:23](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/logger.ts#L23)

Log level (error, warn, info, debug)

***

### maxFiles?

> `optional` __maxFiles__: `number`

Defined in: [src/utils/logger.ts:29](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/logger.ts#L29)

Max number of rotated log files

***

### maxSize?

> `optional` __maxSize__: `string` \| `number`

Defined in: [src/utils/logger.ts:27](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/logger.ts#L27)

Max log file size in bytes or string format (e.g., '1MB')
