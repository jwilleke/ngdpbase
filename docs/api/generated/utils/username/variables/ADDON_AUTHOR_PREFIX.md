[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/username](../README.md) / ADDON\_AUTHOR\_PREFIX

# Variable: ADDON\_AUTHOR\_PREFIX

> `const` __ADDON\_AUTHOR\_PREFIX__: `"addon:"` = `'addon:'`

Defined in: src/utils/username.ts:88

The prefix of an add-on's pages' author (#2255): `addon:<slug>`. The pages
an add-on pushes to a site are authored by the add-on, as required pages
are by `system`. No username may start with it, so no account is ever an
add-on page's author, and a start-up conversion keeps it as it is.
