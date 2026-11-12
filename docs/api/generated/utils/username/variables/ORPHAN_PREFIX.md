[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/username](../README.md) / ORPHAN\_PREFIX

# Variable: ORPHAN\_PREFIX

> `const` __ORPHAN\_PREFIX__: `"orphan:"` = `'orphan:'`

Defined in: src/utils/username.ts:107

The prefix a start-up conversion gives a stored username that has no
account (#2041): `orphan:<name>`. The record is then nobody's: a later
account with the same name never takes it over, no "is it mine" check
matches it, and only an administrator can act on it. No username may
start with it.
