[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/SharedFolderManager](../README.md) / SharedFolderOtherPolicy

# Interface: SharedFolderOtherPolicy

Defined in: src/managers/SharedFolderManager.ts:135

A policy in force that reaches a folder and that the screen did not write: shipped, an add-on's, or the site's own. Shown, never changed here.

## Properties

### actions

> __actions__: `string`[]

Defined in: src/managers/SharedFolderManager.ts:142

Which of `shared-folder-read` and `shared-folder-file` it decides, as the PDP matches actions (an empty list or `*` is both).

***

### effect

> __effect__: `string`

Defined in: src/managers/SharedFolderManager.ts:138

***

### id

> __id__: `string`

Defined in: src/managers/SharedFolderManager.ts:136

***

### name

> __name__: `string`

Defined in: src/managers/SharedFolderManager.ts:137

***

### reserved

> __reserved__: `boolean`

Defined in: src/managers/SharedFolderManager.ts:144

It has an id the screen writes for this folder: saving the folder is refused until it is renamed or removed.

***

### subjects

> __subjects__: `string`[]

Defined in: src/managers/SharedFolderManager.ts:140

Its subjects as written (`role:editor`, `job:nightly`); empty: everyone, anonymous visitors included.
