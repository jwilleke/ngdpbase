---
name: BaseProvider
description: Root class every provider base inherits from — carries the durability contract and nothing else
dateModified: '2026-09-01'
category: providers
code: src/providers/BaseProvider.ts
---

# BaseProvider

The root the nine provider base classes inherit from. It exists for one contract: __a provider states what it does with data between accepting it and having it on disk.__

## Why it exists

That question is not specific to any one subsystem. A page provider that buffers its index writes, a search provider that batches, an audit provider that flushes on a timer and a logging provider that does the same all have the same window in which a record can be lost. Before this, only auditing could describe that window, and it described it wrongly — see [#1148](https://github.com/jwilleke/ngdpbase/issues/1148).

## The contract

```ts
getDurability(): ProviderDurability | null
```

| Field | Meaning |
|---|---|
| `bufferedForMs` | Milliseconds a record may sit in memory before being written. `0` = never buffered |
| `bufferedRecords` | Records held before an early write is forced. `0` = no bound |
| `fsync` | Whether a write is flushed to disk before being reported as stored |

__`null` means the provider has not stated its durability.__ Silence, not a default. A provider that buffers and forgets to declare it must not inherit an assertion that it writes immediately — that is exactly the defect this contract replaces, where `durable` was derived from an unrelated property and was true for every storing provider. A reporting surface renders `null` as *not stated*, never as *durable*.

## Facts, not a claim

There is deliberately no `durable: boolean`. Durability on a single node means write, `fsync`, then acknowledge — and even that trusts a disk controller's cache, while a failed disk takes the data with it. No provider can honestly return `true`, so none is asked to. It reports the window and the reader draws the conclusion. See [security-posture.md](../security-posture.md) D21.

## Who inherits it

`BaseAttachmentProvider`, `BaseAuditProvider`, `BaseBackupProvider`, `BaseCacheProvider`, `BaseLoggingProvider`, `BaseMediaProvider`, `BasePageProvider`, `BaseSearchProvider`, `BaseUserProvider`.

[BaseAuthProvider](BaseAuthProvider.md) is an interface rather than a class and stores nothing, so it is outside this hierarchy.

Only `FileAuditProvider` declares real numbers so far. The rest report `null` until their write paths have been read — a provider is given a durability claim when somebody has verified it, never before.

## Deliberately narrow

This class carries the durability contract and nothing else, although the nine bases do share more: `engine` and `initialized` in 7 of 9, `getProviderInfo` in 8 of 9, `initialize` in 8 of 9. They differ in visibility and in signature, and unifying them is a provider __lifecycle__ contract — a separate piece of design, with the same shape as [#1006](https://github.com/jwilleke/ngdpbase/issues/1006) on the manager side.
