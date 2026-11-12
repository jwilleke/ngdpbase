[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageUrl](../README.md) / pageUrl

# Function: pageUrl()

> __pageUrl__(`pageName`, `action?`): `string`

Defined in: src/utils/pageUrl.ts:23

The URL for `action` on the page named `pageName`.

## Parameters

### pageName

`string`

### action?

[`PageAction`](../type-aliases/PageAction.md) = `'view'`

## Returns

`string`

## Examples

```ts
pageUrl('Main') === '/view/Main'
```

```ts
pageUrl('vaults/jim/default/Diary', 'edit') === '/vaults/jim/default/Diary/edit'
```

```ts
pageUrl('shared/default/Minutes') === '/shared/default/Minutes' (#2125)
```
