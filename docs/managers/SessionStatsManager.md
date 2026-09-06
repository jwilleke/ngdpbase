---
name: SessionStatsManager
description: "In-process session counts and user lists from the express-session store, shared by the session routes and SessionsPlugin"
dateModified: '2026-09-06'
category: managers
code: src/managers/SessionStatsManager.ts
---

# SessionStatsManager

__Module:__ `src/managers/SessionStatsManager.ts`
__Extends:__ [BaseManager](BaseManager.md)

In-process reads of the express-session store: how many sessions exist, how many distinct users hold them, and which authenticated usernames are present. One implementation, shared by the `/api/session-count` and `/api/session-users` routes and by [SessionsPlugin](../plugins/SessionsPlugin.md).

## Why it exists (#1246)

SessionsPlugin used to obtain these numbers by requesting this server's own `http://<host>:<port>/api/session-count` through a bare global `fetch`. That was an outbound HTTP call outside `src/http/` (#1133) which `guardedFetch` cannot take, since loopback is refused unconditionally (#1186), and it rendered `0` in any container whose configured host was not reachable from inside the process. The store is an in-process object; reading it needs no socket.

## Wiring

- `WikiEngine` registers the manager early, next to MetricsManager.
- `app.ts` builds the express-session store, hands it to `attachStore(store)`, and passes the same object to `session({ store })`. The routes see it as `req.sessionStore`.
- The routes call the exported helpers on `req.sessionStore`; the plugin calls the manager. Both paths run the same code.

## API

| Member | Purpose |
| --- | --- |
| `attachStore(store)` | Called once by `app.ts`. Until then `hasStore()` is `false` and the reads throw. |
| `hasStore()` | Whether a store is attached; the plugin renders `0` when not. |
| `count()` | `{ sessionCount, distinctUsers }`. Prefers `store.length` (cheap; `distinctUsers` then equals the count), falls back to `store.all` and counts distinct usernames plus one anonymous bucket. |
| `users()` | `{ users, anonymous, total }`. Needs `store.all`; under `length` alone the list is empty and every session counts as anonymous. |
| `countSessions(store)`, `listSessionUsers(store)` | The exported helpers the routes use directly on `req.sessionStore`. |
| `SessionStoreUnsupportedError` | Thrown when the store implements neither `length` nor `all`; the routes map it to `501`. |

## Errors

A missing store is `503` on the routes and `0` in the plugin. A store error is `500` on the routes and `0` in the plugin, logged. The plugin never throws into the page.

## Related

- [SessionsPlugin](../plugins/SessionsPlugin.md)
- [security-posture.md](../security-posture.md), the outbound boundary
- #1246, #1133, #1186, #1239 (the eslint rule that found the alias)
