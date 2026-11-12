[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/strayFormFields](../README.md) / isStrayFormField

# Function: isStrayFormField()

> __isStrayFormField__(`key`): `boolean`

Defined in: src/utils/strayFormFields.ts:10

Form fields an earlier editor save wrongly stored as page frontmatter
(#1353): the editor's `baseLastModified` concurrency token, and the
`web_form_*` fields a browser extension adds at submit.

The one statement of the rule. A save drops them (`WikiRoutes.savePage`),
and `scripts/strip-stray-frontmatter.ts` removes them from pages nobody
has saved since.

## Parameters

### key

`string`

## Returns

`boolean`
