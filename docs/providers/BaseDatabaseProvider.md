---
name: BaseDatabaseProvider
description: Abstract application-database provider — the connection, integrity check, storage report and close that DatabaseManager hands out (#1536)
dateModified: '2026-10-02'
category: providers
code: src/providers/BaseDatabaseProvider.ts
---

# BaseDatabaseProvider

__Module:__ `src/providers/BaseDatabaseProvider.ts`
__Extends:__ [BaseProvider](../../src/providers/BaseProvider.ts)

The contract behind [DatabaseManager](../managers/DatabaseManager.md): a provider opens the application database, runs the migration ledger, and exposes:

- `handle` — the open, migrated connection, for the row-storing providers built over it
- `integrityOk()` — whether the database passes its integrity check
- `storage()` — where the data lives, its size, and whether it is encrypted
- `close()`

The only implementation is [SqliteDatabaseProvider](SqliteDatabaseProvider.md).
