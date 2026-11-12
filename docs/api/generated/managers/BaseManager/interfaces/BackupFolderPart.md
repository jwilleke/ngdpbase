[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / BackupFolderPart

# Interface: BackupFolderPart

Defined in: src/managers/BaseManager.ts:108

A folder a manager keeps its data in (#1985): BackupManager archives it
beside the backup document, stages it in a site restore, and puts the
staged copy in place at the next start before the manager reads it.

## Properties

### exclude?

> `optional` __exclude?__: (`relative`) => `boolean`

Defined in: src/managers/BaseManager.ts:114

Leave out a path relative to the folder, in posix form (job state's slot locks).

#### Parameters

##### relative

`string`

#### Returns

`boolean`

***

### folder

> __folder__: `string` \| `null`

Defined in: src/managers/BaseManager.ts:112

The folder, resolved; null when this site has none configured.

***

### optional?

> `optional` __optional?__: `boolean`

Defined in: src/managers/BaseManager.ts:120

A backup with no record of this part stages nothing for it, and the
restore names it as not restored. Without it such a backup refuses the
whole site restore (one taken before the part was backed up).

***

### part

> __part__: `string`

Defined in: src/managers/BaseManager.ts:110

The archive's name: `<stem>.<part>.tar` (`.tar.enc` under the backup key). Never change it: old backups are matched by it.
