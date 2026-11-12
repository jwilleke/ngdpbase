[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/SharedFolderManager](../README.md) / SharedFoldersWordsInfo

# Interface: SharedFoldersWordsInfo

Defined in: src/managers/SharedFolderManager.ts:242

What Admin → Backup shows about the organization's recovery words: never the words.

## Extended by

- [`SharedFoldersWordsState`](../../../utils/sharedFoldersWordsConsent/interfaces/SharedFoldersWordsState.md)

## Properties

### madeAt

> __madeAt__: `string`

Defined in: src/managers/SharedFolderManager.ts:245

***

### protectsFolders

> __protectsFolders__: `boolean`

Defined in: src/managers/SharedFolderManager.ts:248

Whether any folder key is sealed for this set: such a set can never be discarded.

***

### shownTo

> __shownTo__: `string`

Defined in: src/managers/SharedFolderManager.ts:246

***

### wordsId

> __wordsId__: `string`

Defined in: src/managers/SharedFolderManager.ts:244

Which set (`recoveryWordsId`): what the admin's confirmation is bound to.
