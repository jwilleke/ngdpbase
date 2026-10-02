---
name: SqliteDatabaseProvider
description: The application database as one SQLite file, SQLCipher-encrypted when NGDPBASE_DATABASE_KEY is set; WAL mode, fsynced, migrated at open (#1536)
dateModified: '2026-10-02'
category: providers
code: src/providers/SqliteDatabaseProvider.ts
---

# SqliteDatabaseProvider

__Module:__ `src/providers/SqliteDatabaseProvider.ts`
__Extends:__ [BaseDatabaseProvider](BaseDatabaseProvider.md)

One SQLite file through `better-sqlite3-multiple-ciphers`, ported from yourPHR. Configuration, the boot refusals and the migration ledger are described on [DatabaseManager](../managers/DatabaseManager.md).

- Encrypted with SQLCipher when a key is given; a wrong key fails at open, before anything is written.
- WAL mode, `synchronous = FULL`; reports itself unbuffered and fsynced.
- Opened and migrated in the constructor, so providers built over the handle see a finished schema.
- Refuses a file on a network filesystem (`sqliteLocation.ts`).
