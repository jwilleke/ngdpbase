[__ngdpbase API v1.5.0__](../README.md)

***

[ngdpbase API](../README.md) / logger

# logger

Simple logging framework using winston

Provides centralized logging for the entire ngdpbase application with
file rotation, console output, and configurable log levels.

## Example

```ts
import logger from './utils/logger';
logger.info('Application started');
logger.error('Error occurred', { error });
```

## Interfaces

- [LoggerConfig](interfaces/LoggerConfig.md)

## Variables

- [default](variables/default.md)

## Functions

- [createLoggerWithConfig](functions/createLoggerWithConfig.md)
- [reconfigureLogger](functions/reconfigureLogger.md)
