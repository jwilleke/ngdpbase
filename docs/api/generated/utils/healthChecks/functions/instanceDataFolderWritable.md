[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/healthChecks](../README.md) / instanceDataFolderWritable

# Function: instanceDataFolderWritable()

> __instanceDataFolderWritable__(`configManager`, `access`): `Promise`\<`boolean`\>

Defined in: src/utils/healthChecks.ts:101

Whether the instance data folder is writable — the readiness check that holds
sessions, config, logs and the page index.

Reads the folder the rest of the app uses, `getInstanceDataFolder()`
(`FAST_STORAGE`, else `INSTANCE_DATA_FOLDER`, else `./data`). It used to read
`ngdpbase.directories.data`, whose default is `"${FAST_STORAGE}"`: the image
sets only `INSTANCE_DATA_FOLDER`, so in a container the placeholder stayed
unresolved, the access check failed, and readiness answered 503 forever
(found releasing v4.17.0).

## Parameters

### configManager

\{ `getInstanceDataFolder?`: () => `string`; \} \| `null` \| `undefined`

Supplies the instance data folder

### access

(`dir`) => `Promise`\<`void`\>

Filesystem access check; injected for tests

## Returns

`Promise`\<`boolean`\>
