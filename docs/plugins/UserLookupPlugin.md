---
name: UserLookupPlugin
description: Searches users via the asset-search API and renders results as a sortable table (PII gated server-side)
dateModified: '2026-05-14'
category: plugins
code: src/plugins/UserLookupPlugin.ts
---

# UserLookupPlugin

Searches users and renders results as a sortable table. Permission gating is handled server-side by the API — callers without `user-read` permission receive only `username` and `displayName`.

__Source:__ `src/plugins/UserLookupPlugin.ts`
__Registered as:__ `UserLookupPlugin`
__Wiki syntax:__ `[{UserLookup ...}]`

## Usage

```wiki
[{UserLookup}]
[{UserLookup q='alice'}]
[{UserLookup q='$currentUser' fields='all'}]
[{UserLookup role='admin' fields='username,displayName,email,roles' max='20'}]
```

## Parameters

| Parameter | Default | Description |
| --- | --- | --- |
| `q` | *(none)* | Substring match on username, displayName, or email. Supports `$currentUser` token. |
| `role` | *(none)* | Filter results to users who have this role. |
| `fields` | `username,displayName` | Comma-separated list of columns to display, or `all` to show every field the API returned. Available fields: `username`, `displayName`, `email`, `roles`, `lastLogin`, `isActive`. |
| `max` | `50` | Maximum number of results. Set to `0` for unlimited. |
| `activeOnly` | `true` | Set to `false` to include inactive users. |

## Permission Gating

The plugin calls `UserManager.searchUsers()` with the viewer's own context, and the search decides `search-user` ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)). Every signed-in user holds it as shipped; a viewer without it, anonymous included, sees nothing where the plugin is.

A viewer holding `user-read`, asked of the decision point with the viewer's own context, sees the fields asked for (`email`, `roles`, `lastLogin`, `isActive`). Everyone else sees only `username` and `displayName`, whatever `fields` asks ([#2033](https://github.com/jwilleke/ngdpbase/pull/2033)): every user may search, so the other fields are not theirs to see. No password or credential is ever shown.

## `$currentUser` Token

When `q='$currentUser'` the plugin substitutes the logged-in user's username before querying. Useful for user profile pages.

## Field Rendering

| Field | Rendered as |
| --- | --- |
| `roles` | Comma-separated string |
| `isActive` | `✓` (true) or `✗` (false) |
| `null` / `undefined` | Empty cell |
| All others | HTML-escaped string |

## Output

Returns an HTML table rendered by `formatAsTable()` from `src/utils/pluginFormatters.ts` with `sortable: true` and `defaultSortColumn: 0` (username). Returns `<p><em>No users found.</em></p>` when the result set is empty. Returns `<p class="plugin-error">...</p>` on error or when `UserManager` is unavailable.

## Tests

- `src/plugins/__tests__/UserLookupPlugin.test.ts` — 13 unit tests covering default columns, `fields='all'`, explicit field list, role/array/boolean rendering, empty results, `q` and `$currentUser` params, role filter, max limit, `activeOnly`, HTML escaping, and unavailable manager.
- `src/managers/__tests__/UserManager.searchUsers.test.ts` — 11 unit tests for the underlying search method.
