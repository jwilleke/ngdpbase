[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonTarball](../README.md) / readTarball

# Function: readTarball()

> __readTarball__(`tgz`, `maxUnpackedBytes`): `Promise`\<[`TarballFiles`](../type-aliases/TarballFiles.md)\>

Defined in: src/utils/addonTarball.ts:55

Read and check every entry of the gzipped tarball. Resolves to its files;
rejects on the first thing that is not safe or not understood.

## Parameters

### tgz

`Buffer`

### maxUnpackedBytes

`number`

## Returns

`Promise`\<[`TarballFiles`](../type-aliases/TarballFiles.md)\>
