---
name: BaseLoggingProvider
description: Abstract base class for logging providers — engine-free winston transport/format factory (#169)
dateModified: '2026-05-16'
category: providers
code: src/providers/BaseLoggingProvider.ts
---

# BaseLoggingProvider

__Quick Reference__ | [logger](../../src/utils/logger.ts)

__Module:__ `src/providers/BaseLoggingProvider.ts`
__Type:__ Abstract Logging Provider Base Class
__Status:__ Production

---

## Overview

`BaseLoggingProvider` (Issue #169) puts winston transport + format construction
behind the provider pattern, consistent with the rest of the `Base*Provider`
family. `src/utils/logger.ts` builds its winston logger by delegating to the
active provider, so the storage backend is swappable without touching any of
the ~hundreds of `logger.*` call sites.

### Deliberate deviation from the engine-based provider pattern

Unlike `BaseSearchProvider` / `BaseAuditProvider` / etc., a logging provider
takes __no `engine`__ and has __no `initialize()`__. The logger is bootstrapped
at module load — before `WikiEngine` and `ConfigurationManager` exist — and is
imported by nearly every module (including `ConfigurationManager`). A provider
that read config in its constructor would create a bootstrap cycle. It is a
pure, dependency-free factory. Provider *selection* happens later, in
`WikiEngine.initialize()`, via `setLoggingProvider(resolveLoggingProvider(...))`
once `ngdpbase.logging.provider` is resolved.

## Abstract Interface

```typescript
abstract class BaseLoggingProvider {
  /** Build winston transports for the given resolved config. */
  abstract createTransports(config: LoggingProviderConfig): Transport[];

  /** Build the winston log format (default: timestamped single-line printf). */
  abstract createFormat(): Logform.Format;

  /** Provider metadata, consistent with other Base*Provider classes. */
  getProviderInfo(): LoggingProviderInfo;
}
```

## Related

- [FileLoggingProvider](FileLoggingProvider.md) — default console + rotating-file implementation
- Config key: `ngdpbase.logging.provider` (default `fileloggingprovider`)
