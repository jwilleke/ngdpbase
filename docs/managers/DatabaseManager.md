---
name: DatabaseManager
description: "The one door to the application database: an optional SQLite file, encrypted with SQLCipher when a key is set, with a dated migration ledger"
dateModified: '2026-10-17'
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
- `ngdpbase.database.busy-timeout-ms` — how long a statement waits, in milliseconds, for a lock another connection holds (a second pod during a rolling update, a long read) before failing with `SQLITE_BUSY`. Default `5000`, the driver's own default, stated ([#1710](https://github.com/jwilleke/ngdpbase/issues/1710)). Applies to the application database and every add-on database. A value that is not a whole number, 0 or more, refuses to start.
- `NGDPBASE_DATABASE_KEY` — the SQLCipher key, from the environment or the instance `.env`, never from config. Without it the file is plain SQLite and boot logs a warning.

## What boot refuses

- A database file on a network filesystem (NFS, SMB, CIFS on Linux): WAL mode needs shared memory those do not provide. Unknown filesystem types and non-Linux hosts are allowed. Backups may still go to a NAS.
- A database whose schema records a migration this build does not know — it belongs to a newer build.
- A migration that fails; it is rolled back and named.
- A database that fails SQLite's `quick_check`, or a wrong key.

## Migrations

`src/providers/databaseMigrations.ts` is the ledger: entries with a `YYYYMMDDHHMMSS` id, strictly ascending, each a frozen snapshot of what it did on its date. Each runs once, in its own transaction, and is recorded in `schema_migrations`. There is no `down()`; the rollback is a backup taken before migrating. Use `addColumnWithDefault()` for any counter-like column, so existing rows are backfilled rather than left `NULL`.

## Add-on databases

An add-on that keeps rows gets its own database through the same door ([ngdp-accounting-addons#13](https://github.com/jwilleke/ngdp-accounting-addons/issues/13)). It first declares the database in its own `config/default-config.json` ([#1860](https://github.com/jwilleke/ngdpbase/issues/1860)):

```json
{
  "ngdpbase.addons.accounting.database": { "owner": "accounting", "ledgerTable": "accounting_schema_migrations", "encrypt": "optional" }
}
```

Then it opens it from `register()`:

```ts
const databaseManager = engine.getManager<DatabaseManager>('DatabaseManager');
const db = databaseManager.openAddonDatabase<SqliteHandle>('accounting', {
  migrations: ACCOUNTING_MIGRATIONS,
  ledgerTable: 'accounting_schema_migrations'
});
```

- Only a declared database opens. `openAddonDatabase(owner, { ledgerTable })` throws unless an enabled add-on declares that `owner` with that `ledgerTable`. The key is always `ngdpbase.addons.<the declaring add-on's slug>.database`; the three fields are required and nothing else is allowed.
- `encrypt` is `"required"` or `"optional"`. A `"required"` database is never opened without `NGDPBASE_DATABASE_KEY`: the add-on is not loaded at all (checked before it is imported), and `/admin/addons` shows why. `"optional"` opens unencrypted without a key, with the warning.
- An invalid declaration (a missing or mistyped field, a ledger outside the owner's prefix, a key under another add-on's slug, a ledger another add-on already declares) stops that add-on loading, as a refused system-category does ([#1559](https://github.com/jwilleke/ngdpbase/issues/1559)). It is logged at startup and posted to admins.
- The declaration is read from every installed add-on, on or off, and is never part of the merged configuration, so the site's `app-custom-config.json` cannot change it (a value there is ignored, with a warning). `getDeclaredDatabases()` lists every declaration with its file and whether it is open; Admin → Add-ons shows the list. A turned-off add-on's database stays listed, so the backup ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723)) can include it.
- Call it from `register()`. It needs the application database: when `ngdpbase.database.provider` is `none` it throws, naming the key, and the add-on should mount nothing and say why in `status()`.
- The file is `<owner>.db` beside `ngdpbase.database.file`, opened by `SqliteDatabaseProvider` under `NGDPBASE_DATABASE_KEY`, so everything in [What boot refuses](#what-boot-refuses) applies to it too.
- Its migrations follow the rules in [Migrations](#migrations), recorded in the add-on's own ledger table. The table name must start with the owner's slug, dashes as underscores, then `_`. Prefix the add-on's tables the same way, so several databases can later be told apart by table name in one backup.
- An add-on that depends on the owner declares the owner's slug and its own ledger table (`"owner": "accounting", "ledgerTable": "accounting_dues_schema_migrations"`, under `ngdpbase.addons.accounting-dues.database`), and calls `openAddonDatabase` with them. Its migrations run on the owner's file and it gets the same connection. Registering one ledger table twice throws.
- `integrityOk()` covers every open database, and `shutdown()` closes the add-on databases, then the application database. Managers shut down in reverse registration order, so `AddonsManager`, and the add-ons with it, stop before `DatabaseManager` closes their connections.

## Providers

- [BaseDatabaseProvider](../../src/providers/BaseDatabaseProvider.ts) — `handle`, `integrityOk()`, `storage()`, `close()`.
- [SqliteDatabaseProvider](../../src/providers/SqliteDatabaseProvider.ts) — `better-sqlite3-multiple-ciphers`, WAL mode, `synchronous = FULL`; durability: unbuffered and fsynced. Its constructor takes the ledger table name (default `schema_migrations`), and `migrate(ledger, ledgerTable)` runs a further ledger on the same connection.

## Not yet

- The encrypted file-level backup and staged restore from yourPHR (`sqlite-backup.ts`).
