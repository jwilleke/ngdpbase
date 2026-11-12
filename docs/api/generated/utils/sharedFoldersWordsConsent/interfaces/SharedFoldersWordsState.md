[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sharedFoldersWordsConsent](../README.md) / SharedFoldersWordsState

# Interface: SharedFoldersWordsState

Defined in: src/utils/sharedFoldersWordsConsent.ts:20

The organization's recovery words and what their admin is still to confirm about them.

## Extends

- [`SharedFoldersWordsInfo`](../../../managers/SharedFolderManager/interfaces/SharedFoldersWordsInfo.md)

## Properties

### madeAt

> __madeAt__: `string`

Defined in: src/managers/SharedFolderManager.ts:245

#### Inherited from

[`SharedFoldersWordsInfo`](../../../managers/SharedFolderManager/interfaces/SharedFoldersWordsInfo.md).[`madeAt`](../../../managers/SharedFolderManager/interfaces/SharedFoldersWordsInfo.md#madeat)

***

### pending

> __pending__: [`ConsentDocument`](../../../types/Consent/interfaces/ConsentDocument.md)[]

Defined in: src/utils/sharedFoldersWordsConsent.ts:22

The document at its current version when `shownTo` has not confirmed it for this set; empty when they have.

***

### protectsFolders

> __protectsFolders__: `boolean`

Defined in: src/managers/SharedFolderManager.ts:248

Whether any folder key is sealed for this set: such a set can never be discarded.

#### Inherited from

[`SharedFoldersWordsInfo`](../../../managers/SharedFolderManager/interfaces/SharedFoldersWordsInfo.md).[`protectsFolders`](../../../managers/SharedFolderManager/interfaces/SharedFoldersWordsInfo.md#protectsfolders)

***

### shownTo

> __shownTo__: `string`

Defined in: src/managers/SharedFolderManager.ts:246

#### Inherited from

[`SharedFoldersWordsInfo`](../../../managers/SharedFolderManager/interfaces/SharedFoldersWordsInfo.md).[`shownTo`](../../../managers/SharedFolderManager/interfaces/SharedFoldersWordsInfo.md#shownto)

***

### wordsId

> __wordsId__: `string`

Defined in: src/managers/SharedFolderManager.ts:244

Which set (`recoveryWordsId`): what the admin's confirmation is bound to.

#### Inherited from

[`SharedFoldersWordsInfo`](../../../managers/SharedFolderManager/interfaces/SharedFoldersWordsInfo.md).[`wordsId`](../../../managers/SharedFolderManager/interfaces/SharedFoldersWordsInfo.md#wordsid)
