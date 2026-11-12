[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / BackupFilePart

# Interface: BackupFilePart

Defined in: src/managers/BaseManager.ts:127

One file a manager keeps its data in (#1985): the credentials store. As a
folder, but the archive holds the one file.

## Properties

### file

> __file__: `string` \| `null`

Defined in: src/managers/BaseManager.ts:130

The file, resolved; null when this site has none configured.

***

### optional?

> `optional` __optional?__: `boolean`

Defined in: src/managers/BaseManager.ts:137

***

### part

> __part__: `string`

Defined in: src/managers/BaseManager.ts:128

***

### requireKey?

> `optional` __requireKey?__: `boolean`

Defined in: src/managers/BaseManager.ts:134

Only ever backed up encrypted: without the backup key it is left out, with a warning (#1876).

***

### what

> __what__: `string`

Defined in: src/managers/BaseManager.ts:132

How the backup and the log name it ("credentials store").

***

### whenAbsent

> __whenAbsent__: `string`

Defined in: src/managers/BaseManager.ts:136

Staged in its place when the file was absent at backup time, so the restore still puts the site back as it was.
