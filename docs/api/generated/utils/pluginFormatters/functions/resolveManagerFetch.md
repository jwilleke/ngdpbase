[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / resolveManagerFetch

# Function: resolveManagerFetch()

> __resolveManagerFetch__(`spec`, `context`): `Promise`\<[`ManagerFetchResult`](../type-aliases/ManagerFetchResult.md)\>

Defined in: src/utils/pluginFormatters.ts:874

Resolve the `fetch='ManagerName.toMarqueeText(k=v,...)'` plugin convention to text.

Extracted from MarqueePlugin (#685 slice 2). Page text names the manager and
the method, so this is reachable by anyone who can edit a page and runs on
every render, for every viewer (#1556). Two rules make that safe:

- __Only `toMarqueeText`.__ Any other method — an index rebuild, a scan,
  anything with a side effect — is refused, whatever the manager offers.
  `BaseManager.toMarqueeText()` is the convention, and the only method any
  shipped page or doc uses.
- __The viewer's context goes with it__ (every call carries a context). The
  manager decides what that viewer may see; nothing runs as the server.

The raw `{k: v}` args object is passed as the first argument (the manager
owns its own option parsing via `managerUtils.ts`), the viewer second.

# 1751: the render depends on the manager's data, so the page cache
re-renders once that manager bumps its topic (its own name).

## Parameters

### spec

`string` \| `undefined`

### context

#### engine?

\{ `getManager`(`name`): `unknown`; \}

#### engine.getManager

(`name`) => `unknown`

#### userContext?

`unknown`

## Returns

`Promise`\<[`ManagerFetchResult`](../type-aliases/ManagerFetchResult.md)\>
