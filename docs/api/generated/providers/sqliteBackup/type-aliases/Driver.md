[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteBackup](../README.md) / Driver

# Type Alias: Driver

> __Driver__ = *typeof* `DatabaseConstructor`

Defined in: src/providers/sqliteBackup.ts:42

The SQLite driver, handed in rather than imported: the worker loads it from
the file the site's own thread resolved (`job.driver`), so both threads use
the same native module, and a worker run from source (tsx) is not sent to
the type declarations tsconfig's `paths` maps the package name to.
