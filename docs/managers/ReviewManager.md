---
name: ReviewManager
description: One core way to review requests — an add-on files one naming the permission whose holders decide; they are notified, approve or reject on /reviews, and the add-on's handler carries an approval out (#2072)
dateModified: '2026-10-25'
category: managers
code: src/managers/ReviewManager.ts
---

# ReviewManager

ReviewManager owns one fact: __the requests for review__ ([#2072](https://github.com/jwilleke/ngdpbase/issues/2072)). Generic work comes to core first, so no add-on builds its own queue: the forms add-on's "needs review", association's occupancy submissions and accommodation's owner changes all file here.

It asks for everything else:

- __Who decides__ is the PDP's. A request names a permission (`decidePermission`), never a role; every list and decision asks the PDP with the caller's context.
- __Who is told__ is `PolicyDecisionPoint.usersHolding(decidePermission)`. Nobody holding it is logged only, since an empty target list means every user.
- __The work__ is the filing add-on's handler, registered under its own prefix.

## Why this manager

[Manager-SOT](Manager-SOT.md): one fact, one owner. No existing manager owns requests: NotificationManager tells users things and keeps nothing to decide; BackgroundJobManager runs work, it does not hold a question for a user; the forms add-on's submission status is one add-on's own data. A request is a new kind of record, with its own door, so it gets its own manager.

## The door

| Call | Who may | What it does |
| --- | --- | --- |
| `fileRequest(ctx, { kind, subject, summary, details, decidePermission, handlerId })` | add-on code, for a handler it registered; `ctx` is whoever it is for (a public form's visitor included) | Validates, stores the request open, records `review-filed`, notifies the holders |
| `listOpen(ctx)` | anyone; returns only what `ctx` may decide | Open requests, oldest first, at most `ngdpbase.reviews.list-limit` |
| `get(ctx, id)` | a holder of the request's permission | One request, open or decided; `ReviewRefusedError` otherwise |
| `decide(ctx, id, 'approve' \| 'reject', note?)` | a holder of the request's permission (`pdp.decide`, so step-up applies) | Reject closes it; approve runs the handler with `ctx`, then marks it approved |
| `registerHandler(owner, handlerId, fn)` | core, for an add-on, through `host.registerReviewHandler` | `handlerId` must be `<owner>.<name>` |

- `kind` and `handlerId` start with the filing add-on's slug (`accommodation.new-owner`); `host.reviews.fileRequest` holds an add-on to its own slug, and the manager holds a request's `kind` to its handler's add-on.
- `decidePermission` must be declared in `ngdpbase.permissions.definitions` and grantable; anything else is refused at filing (`ReviewInputError`), since nobody could decide it.
- `subject` (200 characters) and `summary` (500) are one line each; `details` is label and value pairs, at most `ngdpbase.reviews.details-max-bytes` as JSON.
- Filing asks no permission: only add-on code reaches it, and only for its own registered handler. A route that lets users file (a form) asks its own permission first (`form-submit`).

## Complete or not

On approval the handler runs __in the decider's request, awaited__, not as a background job: the reviewer is told at once whether it was done. A handler does I/O (create an account, send an invitation), not CPU-heavy work.

- The handler returns `{ summary }`: the request is approved, with that summary as its outcome, shown to the reviewer.
- The handler throws (or the add-on is not running): the request __stays open__, with the error's message and the time recorded as its failure and shown on `/reviews`; `ReviewHandlerFailedError` reaches the route. Approving again retries.
- One decision at a time per request (`KeyedSerial`), so two reviewers approving at once run the handler once; the second is told it was approved already (`ReviewNotOpenError`).

## Storage

Requests live in core's application database, table `review_requests` (migration `20261025120000`), through `DatabaseManager.getHandle()`. A request's summary and details can be personal (a new owner's name and email), so, as the [storage guide](../guides/storage-developer-guide.md#declaring-a-database) asks of anything personal, they are kept __only while that database is encrypted__ (SQLCipher, `NGDPBASE_DATABASE_KEY`):

- `ngdpbase.database.provider` `none`: the manager is off (`markDisabled`), and every call throws `ReviewsUnavailableError` naming the fix.
- A `sqlite` database without a key: the manager needs attention (`markNeedsAttention`, the admin dashboard), and it stores no request.

What leaves the database is names only. The notice to deciders is generic: "A `<kind>` request is waiting for your review on the Reviews page (/reviews)", with no subject, summary or name, because notifications are stored in the clear. The audit records and log lines carry the request's id, kind and handler, never its words or a handler's failure text. After a decision, `/reviews` is redirected to with only an outcome code and the id (`?done=approved&id=<uuid>`); the page builds the message from the store, under the viewer's own decide check, so no request text is in a URL, a log or the browser history.

__This covers ReviewManager's store only.__ What the filing add-on keeps for itself is its own, and the forms add-on keeps each "needs review" submission as plain JSON in its data folder until the request is decided ([storage guide, Known gaps](../guides/storage-developer-guide.md#known-gaps)).

It is backed up and restored with the application database by DatabaseManager; ReviewManager writes no backup code and declares no folder.

## Configuration

- `ngdpbase.reviews.retention-days` (365): a decided request older than this is removed, at start and whenever a request is filed (one indexed delete). `0` keeps them. Open requests are never removed.
- `ngdpbase.reviews.list-limit` (200): the most open requests `listOpen` returns.
- `ngdpbase.reviews.details-max-bytes` (65536): the largest `details` accepted, as JSON.

## Audit

Four events, each `grantable: false` and on-failure `continue`, recorded by this manager with `actorOf(ctx)`: `review-filed`, `review-approved`, `review-rejected` and `review-failed` (approved, not carried out; `result: failure`). Each carries the request's id as `resource` and its kind, handler and permission; never its subject, summary, details, note or the handler's failure text, which may name someone. The add-on's own actions (the account it creates, the invitation) are recorded by their own doors.

## The reviewer screen

`GET /reviews` lists `listOpen` for the signed-in user (`profile-manage`, which every user holds), with Approve, Reject and an optional note; `POST /reviews/:id/decide` decides. Times are shown in the viewer's local time. A refusal goes through the route's refusal (step-up asks for a fresh sign-in). Users read about it on the shipped [Reviews](/view/reviews) page.

The Executive Hub (`GET /executive`, for holders of `executive-read`, [#2093](https://github.com/jwilleke/ngdpbase/issues/2093)) shows the same `listOpen` answer as its list of requests waiting for the board, and decides through the same `POST /reviews/:id/decide`; the form adds `return=executive`, the one value that sends the viewer back to the hub instead of `/reviews`. A request is "for the board" when its decide permission is one the site grants to the `executive` role; core names no such permission itself. Users read about it on the shipped [Executive Hub](/view/executive-hub) page.

## Known gaps

- [#2072](https://github.com/jwilleke/ngdpbase/issues/2072): a requester cannot see or withdraw their own request (operator: a future enhancement). A rejection calls no add-on code, so an add-on that keeps its own status for the request (the forms add-on's submission stays `pending`) is not told. The one-at-a-time rule holds within one server process; two processes on one database could both run a handler. Nothing links to `/reviews` but the notification and the help page. A "needs review" form submission is kept as plain JSON by the forms add-on, outside the encrypted store (storage guide). Handlers are forgotten when an add-on fails to load or the site shuts down; turning an add-on off takes effect at the next start, so there is no runtime unload to hook. A request whose permission asks for a fresh sign-in (`step-up`) is left off a reviewer's list until they sign in again, since the list asks `permits`, not `holds`. Association's existing queue has not moved onto it yet.
