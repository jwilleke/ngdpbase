[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [WikiRoutes](../README.md) / sweepAnonymousSessions

# Function: sweepAnonymousSessions()

> __sweepAnonymousSessions__(`sessionDir`, `excludeSessionId`): `Promise`\<\{ `kept`: `number`; `orphansRemoved`: `number`; `removed`: `number`; \}\>

Defined in: src/routes/WikiRoutes.ts:801

Sweep anonymous sessions from a session-file-store directory (#777).

"Anonymous" = the session JSON file has neither a top-level
`isAuthenticated: true` nor a nested `user.isAuthenticated === true`.
(express-session entries written by ngdpbase use the top-level form;
the nested-user form is what the issue body describes for stores that
structure session data differently.)

Always deletes `*.json.NNN` atomic-write orphans regardless of contents.
Never deletes a session whose id matches `excludeSessionId` (so the
admin clicking the button can't accidentally log themselves out).

Returns counts for the caller to surface and log.

Extracted as a free function so it's unit-testable against a real temp
directory without spinning up the full WikiRoutes handler.

## Parameters

### sessionDir

`string`

### excludeSessionId

`string` \| `null`

## Returns

`Promise`\<\{ `kept`: `number`; `orphansRemoved`: `number`; `removed`: `number`; \}\>
