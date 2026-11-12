[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / resolveUserParam

# Function: resolveUserParam()

> __resolveUserParam__(`value`, `context`): `string` \| `undefined`

Defined in: src/utils/pluginFormatters.ts:177

Resolve a plugin parameter that may contain the special token `$currentUser`
(case-insensitive) to the authenticated user's username.

Rules:

- Non-token values are returned unchanged.
- `$currentUser` resolves to the username from `context.userContext.username`
  or `context.userName`, whichever is set first.
- Returns `undefined` when the token was used but the visitor is anonymous
  (username is "anonymous" or absent).  The caller can use this
  to detect the "token present but not logged in" case and show a prompt.

## Parameters

### value

`string` \| `undefined`

### context

#### userContext?

\{\[`key`: `string`\]: `unknown`; `username?`: `string`; \}

#### userContext.username?

`string`

#### userName?

`string`

## Returns

`string` \| `undefined`

## Example

```ts
// In a plugin execute():
const author = resolveUserParam(params.author, context);
if (params.author?.toLowerCase() === '$currentuser' && !author) {
  return '<p>Please log in.</p>';
}
```
