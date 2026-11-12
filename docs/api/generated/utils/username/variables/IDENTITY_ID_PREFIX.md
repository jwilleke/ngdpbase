[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/username](../README.md) / IDENTITY\_ID\_PREFIX

# Variable: IDENTITY\_ID\_PREFIX

> `const` __IDENTITY\_ID\_PREFIX__: `"urn:"` = `'urn:'`

Defined in: src/utils/username.ts:80

The prefix of an identity's `@id` (#2041): `urn:uuid:<v4>`, and older
organizations' `urn:…` ids. No username may start with it, so a stored
reference is always told apart: a value starting `urn:` is an `@id`,
anything else a username not yet converted.
