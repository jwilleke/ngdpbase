[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Consent](../README.md) / SHARED\_FOLDERS\_WORDS\_CONSENT\_SCOPE

# Variable: SHARED\_FOLDERS\_WORDS\_CONSENT\_SCOPE

> `const` __SHARED\_FOLDERS\_WORDS\_CONSENT\_SCOPE__: `"shared-folders-recovery-words"` = `'shared-folders-recovery-words'`

Defined in: src/types/Consent.ts:39

The scope of an admin's confirmation that they saved the organization's
shared-folders recovery words (#2124, epic #1775 decision 4). Like
`recovery-words` it never holds a session: it is asked where the words are
shown (Admin → Backup), and until the admin who was shown them confirms,
holders of `admin-system` see a banner. Bound to a subject: the
organization's set of words (`SharedFolderManager.recoveryWordsInfo().wordsId`),
so a new set asks again.
