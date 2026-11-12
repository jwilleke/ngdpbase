[__ngdpbase API v5.43.0__](../README.md)

***

[ngdpbase API](../README.md) / logger

# logger

Simple logging framework using winston

Provides centralized logging for the entire ngdpbase application with
file rotation, console output, and configurable log levels.

Issue #169: transport + format construction is delegated to a
[BaseLoggingProvider](../providers/BaseLoggingProvider/classes/default.md) (default [FileLoggingProvider](../providers/FileLoggingProvider/classes/default.md)) so the
storage backend is swappable. The exported `logger` API is unchanged —
call sites need no edits. The provider is deliberately engine-free: the
logger bootstraps before WikiEngine/ConfigurationManager exist and is
imported by nearly every module, so provider *selection* happens later in
`WikiEngine.initialize()` via [setLoggingProvider](functions/setLoggingProvider.md).

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
- [resolveLoggingProvider](functions/resolveLoggingProvider.md)
- [setLoggingProvider](functions/setLoggingProvider.md)
