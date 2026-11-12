[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/username](../README.md) / ACCOUNTLESS\_PERSON\_PREFIX

# Variable: ACCOUNTLESS\_PERSON\_PREFIX

> `const` __ACCOUNTLESS\_PERSON\_PREFIX__: `"person:"` = `'person:'`

Defined in: src/utils/username.ts:72

The prefix of a person's identifier when the person has no account (#1930):
`person:<uuid>`. No username may start with it, so an account-less person's
identifier can never be, or later become, someone's username.
