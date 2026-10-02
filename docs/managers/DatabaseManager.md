---
name: DatabaseManager
description: "The one door to the application database: an optional SQLite file, encrypted with SQLCipher when a key is set, with a dated migration ledger"
dateModified: '2026-10-02'
category: managers
code: src/managers/DatabaseManager.ts
---

# DatabaseManager

__Module:__ `src/managers/DatabaseManager.ts`
__Extends:__ [BaseManager](BaseManager.md)

The one door to the application database ([#1536](https://github.com/jwilleke/ngdpbase/issues/1536)). A manager that stores rows is handed the connection through `getHandle()`; nothing opens a database handle of its own. Ported from yourPHR, where it is in production.

## Configuration

- `ngdpbase.database.provider` — `none` (default) or `sqlite`. Nothing in core stores rows yet, so no database is opened by default; the first user will be the database audit provider ([#1537](https://github.com/jwilleke/ngdpbase/issues/1537)). Any other value refuses to start.
- `ngdpbase.database.file` — the SQLite file, default `${FAST_STORAGE}/ngdpbase.db`.
- `NGDPBASE_DATABASE_KEY` — the SQLCipher key, from the environment or the instance `.env`, never from config. Without it the file is plain SQLite and boot logs a warning.

## What boot refuses

- A database file on a network filesystem (NFS, SMB, CIFS on Linux): WAL mode needs shared memory those do not provide. Unknown filesystem types and non-Linux hosts are allowed. Backups may still go to a NAS.
- A database whose schema records a migration this build does not know — it belongs to a newer build.
- A migration that fails; it is rolled back and named.
- A database that fails SQLite's `quick_check`, or a wrong key.

## Migrations

`src/providers/databaseMigrations.ts` is the ledger: entries with a `YYYYMMDDHHMMSS` id, strictly ascending, each a frozen snapshot of what it did on its date. Each runs once, in its own transaction, and is recorded in `schema_migrations`. There is no `down()`; the rollback is a backup taken before migrating. Use `addColumnWithDefault()` for any counter-like column, so existing rows are backfilled rather than left `NULL`.

## Providers

- [BaseDatabaseProvider](../../src/providers/BaseDatabaseProvider.ts) — `handle`, `integrityOk()`, `storage()`, `close()`.
- [SqliteDatabaseProvider](../../src/providers/SqliteDatabaseProvider.ts) — `better-sqlite3-multiple-ciphers`, WAL mode, `synchronous = FULL`; durability: unbuffered and fsynced.

## Not yet

- The encrypted file-level backup and staged restore from yourPHR (`sqlite-backup.ts`).
- Shutdown order: the engine shuts managers down in registration order, so this one closes before the managers registered after it. Harmless while nothing uses it; the first row-storing provider must close its statements in its own `shutdown()` or the order must change.
