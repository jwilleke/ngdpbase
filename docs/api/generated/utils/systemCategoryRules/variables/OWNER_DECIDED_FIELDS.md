[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/systemCategoryRules](../README.md) / OWNER\_DECIDED\_FIELDS

# Variable: OWNER\_DECIDED\_FIELDS

> `const` __OWNER\_DECIDED\_FIELDS__: readonly \[`"owner"`, `"encrypt"`, `"defaultPrivate"`, `"shareMaxDays"`, `"comments"`, `"footnotes"`\]

Defined in: src/utils/systemCategoryRules.ts:18

The fields of an entry that are its `owner`'s declaration (operator,
2026-09-29): `encrypt` and `defaultPrivate` stand, and `shareMaxDays` is
decided by the owner; `comments` and `footnotes` stand too (operator,
2026-10-21, #1951). For an entry an add-on declares, a site's
`app-custom-config.json` never changes them, nor `owner` itself.
