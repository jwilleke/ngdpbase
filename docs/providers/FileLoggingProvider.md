---
name: FileLoggingProvider
description: Default logging provider — winston console + rotating-file transports (#169)
dateModified: '2026-05-16'
category: providers
code: src/providers/FileLoggingProvider.ts
---

# FileLoggingProvider

__Quick Reference__ | [BaseLoggingProvider](BaseLoggingProvider.md)

__Module:__ `src/providers/FileLoggingProvider.ts`
__Type:__ Logging Provider (default)
__Status:__ Production

---

## Overview

`FileLoggingProvider` is the default logging backend (Issue #169). It is the
exact behaviour `src/utils/logger.ts` shipped before #169 — a winston console
transport plus a rotating-file transport with a timestamped single-line
format — extracted verbatim behind [BaseLoggingProvider](BaseLoggingProvider.md)
so the backend is swappable. The exported `logger` API is byte-identical;
no call sites changed.

## Behaviour

- __Console transport:__ always added.
- __File transport:__ added only when `config.dir` is set. This preserves the
  pre-#169 guard that avoids creating `./data/logs` before
  `ConfigurationManager` resolves paths (the logger runs with console-only
  defaults until `WikiEngine.initialize()` calls `reconfigureLogger`).
- __`maxSize`:__ accepts a number (bytes) or a `'<n>[MB|KB|B]'` string;
  unparseable values fall back to 1 MB.
- __Format:__ `format.combine(timestamp(), printf(...))` →
  `"<ts> [<level>]: <msg>"`.

## Selection

Selected by `ngdpbase.logging.provider: "fileloggingprovider"` (the default).
`resolveLoggingProvider()` falls back to this provider for unknown/empty names —
logging must never fail to initialize because of a misconfigured key.

## Related

- [BaseLoggingProvider](BaseLoggingProvider.md) — abstract contract
