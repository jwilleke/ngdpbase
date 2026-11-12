[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/managerUtils](../README.md) / parseManagerFetchOptions

# Function: parseManagerFetchOptions()

> __parseManagerFetchOptions__(`raw?`): [`ManagerFetchOptions`](../interfaces/ManagerFetchOptions.md)

Defined in: src/utils/managerUtils.ts:42

Parse a raw key=value args object (from a plugin fetch= parameter) into
a typed ManagerFetchOptions. Unknown keys are silently ignored — each
manager is responsible for reading its own domain-specific keys from the
same raw object.

Convenience shorthand: `sort='date-desc'` expands to
`{ sortBy: 'date', sortOrder: 'desc' }`.

## Parameters

### raw?

`Record`\<`string`, `string`\> = `{}`

## Returns

[`ManagerFetchOptions`](../interfaces/ManagerFetchOptions.md)

## Example

```ts
// fetch='HansDataManager.toMarqueeText(limit=3,sort=date-desc)'
// raw = { limit: '3', sort: 'date-desc' }
const opts = parseManagerFetchOptions(raw);
// opts = { limit: 3, sortBy: 'date', sortOrder: 'desc' }
```
