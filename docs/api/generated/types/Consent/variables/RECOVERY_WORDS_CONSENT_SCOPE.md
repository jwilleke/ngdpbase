[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Consent](../README.md) / RECOVERY\_WORDS\_CONSENT\_SCOPE

# Variable: RECOVERY\_WORDS\_CONSENT\_SCOPE

> `const` __RECOVERY\_WORDS\_CONSENT\_SCOPE__: `"recovery-words"` = `'recovery-words'`

Defined in: src/types/Consent.ts:25

The scope of a user's confirmation that they saved their own recovery words
(#1928). Not core's terms: it never holds a session. It is asked where the
words are shown (the store door, and a new set of words, #1925), and a user
with encrypted vaults who has not confirmed the current version for their
current words is reminded by a banner.

Bound to a subject: the set of words (`recoveryWordsId`), so a new set asks
again.
