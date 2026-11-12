[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/databaseKey](../README.md) / DATABASE\_KEY\_ENV

# Variable: DATABASE\_KEY\_ENV

> `const` __DATABASE\_KEY\_ENV__: `"NGDPBASE_DATABASE_KEY"` = `'NGDPBASE_DATABASE_KEY'`

Defined in: src/utils/databaseKey.ts:7

The environment variable holding the SQLCipher key (#1536). Never a config
key: config is readable from the admin screens. Declared here, with no
dependencies, so the boot (`bootstrap-env.ts`) can name it without loading
DatabaseManager; DatabaseManager re-exports it.
