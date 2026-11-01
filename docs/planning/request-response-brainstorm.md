---
title: Request-response engine — brainstorm notes
description: Working notes for a general request-response engine (reimbursements, maintenance requests, approvals). Brainstorm only; nothing decided until it moves to decisions.md.
last_updated: "2026-10-16"
---

# Request-response engine — brainstorm notes

Status: __brainstorming__. No code. Started from #8 (expense reimbursements with treasurer approval).
Decisions move to [decisions.md](https://github.com/jwilleke/ngdpbase-addons/blob/main/docs/plans/decisions.md) only when the operator confirms them.

## Operator answers so far (2026-10-16)

- __General engine, not reimbursement-only.__ Lives in ngdpbase core or as an independent add-on (not
  inside accounting). Must fit accounting (reimbursements) and other things such as maintenance
  requests.
- __Second approver:__ a configuration entry (who, and above what amount).
- __Paying is outside the engine.__ The request-response engine ends at "approved"; paying belongs to
  a payments side (a `PaymentsManager`?, see #3), which posts the ledger entry.
- __Attachments:__ in the general engine a receipt or photo is just an attachment.
- __Open:__ notifications — banner, email too, or a "waiting for you" section in `/profile`.
- __Open:__ receipts in ngdpbase attachments vs a private store (vault) only requester and approvers
  can open.

## What the existing Fairways system teaches

Source: `fairways-request-response` (Google Forms + Sheets + Apps Script; 1,100+ requests).
`fairways-gen2-website` (the Fairways site on ngdpbase) has no request add-on yet; it links to the
Google Request form.

How it works today:

- Two forms: __Request__ (one row per request) and __Response__ (many rows per request).
- Request: number, time, name, address, phone, email, request type (driveway, gutters, landscaping,
  lawn, other, unit-owner maintenance), nature (free text), urgency, photos/documents.
- Response: request number, date, details, category (can re-classify), response type (status),
  estimate (details, amount, completion date), photo/PDF, payment request (amount, invoice PDF),
  "notify requestor" yes/no.
- Status = the latest response's type: no response, pending, pending review, in progress, completed.
- Every request and response emails the requestor, the maintenance group and the board group.
- Reports: uncompleted requests; each request with all its responses; work orders; by address.

Lessons (each was a real outage or limit):

- __Real links, never value scans.__ Responses were written onto the wrong requests because the
  request was found by searching for a number anywhere in the sheet.
- __Schema not tied to column headers.__ A trailing space in a header broke every submission.
- __Durable outbox for notifications__, with retry and resend, and one send per event. Emails failed
  silently more than once; resend scripts were written by hand.
- __Validate recipients__; keep "notify me" separate from the address (the word "No" ended up as an
  email address).
- __Pick a request by search, not a dropdown of every number__ (Google Forms caps choices at 1,000).
- __A real status model__ with allowed steps; today any response can set any status.
- __Access control__: today everyone on the board and maintenance lists sees everything.
- __Approval-type requests exist already__, handled informally: board written approval for plantings,
  trees, and door/window color changes.
- Estimates and invoices ride on responses: the engine should let a response carry an amount and a
  document, and hand a "pay this" to the payments side.

## Shape so far (draft)

- __Request__: a typed record (type declares its fields, who may see it, its steps). One record; many
  responses, linked by id.
- __Response__: an entry on a request (comment, status change, estimate, approval, rejection,
  "need more information", answer). Append-only history; nothing edited after the fact.
- __Steps are permissions__ asked of ngdpbase's decision point; every step audited (D-025 model).
- __Rules in policy/configuration__: no approving your own request; second approver above a
  configured amount; who may respond to which type.
- __Hand-offs__ at the end of a flow: approved reimbursement → payments; completed maintenance with an
  invoice → payments.

## Standards to consider

No one standard covers the whole engine; several fit parts of it.

- __HL7 FHIR `Task`__ — closest to the whole engine ("someone asked someone to do something").
  Statuses: draft, requested, received, accepted, rejected, ready, cancelled, in-progress, on-hold,
  failed, completed, entered-in-error. Fields: `requester`, `owner` (who must act), `focus` (what it is
  about), `businessStatus` (a type's own sub-status), notes, inputs, outputs. Also lines up with phr.
- __Open311 GeoReport v2__ — civic maintenance requests: `service_code` (type), description,
  address/location, `media_url`, `status` + `status_notes`, `agency_responsible`, requested / updated /
  expected dates. A field list for the maintenance type.
- __schema.org `Action`__ — ngdpbase already uses schema.org for records. `actionStatus` (potential,
  active, completed, failed); `AssessAction`, `AcceptAction`, `RejectAction`, `AssignAction`,
  `CommentAction` could name response kinds.
- __W3C ActivityStreams 2.0__ — verbs with actor/object/target (Offer, Accept, Reject,
  TentativeAccept, Question, Note, Invite): an alternative naming for responses and a history feed.
- Too heavy to adopt, useful to know: BPMN 2.0 / CMMN (OMG) for drawing flows; WS-HumanTask (OASIS);
  ITIL service-request vocabulary.
- Already in use nearby: XACML-style decisions (D-025), UN/CEFACT payment means; ISO 20022 belongs to
  the payments side.

Suggestion (not decided): FHIR Task for the record, statuses and requester/owner; schema.org Actions
for response kinds; Open311 as the maintenance type's fields.

## Working shape (operator, 2026-10-16 — leaning, not decided)

- Request record, statuses and requester/owner from __FHIR Task__.
- Response kinds named with __schema.org Actions__ (matches ngdpbase).
- __Hand-off = change of owner.__ FHIR Task's `owner` can be a person, a group or a system. At a
  status set per request type, the owner becomes the next actor:
  - a __person__ (treasurer; "Julie, please look at this") — responds on screen;
  - a __group or role__ (maintenance, board) — anyone in it may respond;
  - a __manager__ (`PaymentsManager`, maybe `MaintenanceManager`) — the engine hands it the request;
    it responds like a person ("paid, ref 1042"), which moves the status on.
- One record, full history, every step through the same checked and audited door.
- Example, reimbursement: requested (owner treasurer) → approved (above threshold: owner second
  approver → approved) → accepted, owner PaymentsManager → "paid, ref …" → completed.
- __Maintenance is a request type, for now__ (operator). First types, as in the Google Fairways
  system: __maintenance__ requests and __board__ requests.
- __Later, a `MaintenanceManager` routes work orders__ (operator): it decides where a work order goes,
  the in-house maintenance person or an outside vendor. In this shape it is an owner the engine hands
  a maintenance request to, and it hands the work on (another owner change).
- __Routing / triage: TBD__ (operator). Whether the requester picks the type or one inbox is sorted
  later (Fairways responders re-classify today) is open. For now the request type alone decides.

## Generic skeleton (draft)

| Part | What it is | Set per request type |
|---|---|---|
| Request | who asked, when, type, fields, attachments | the type's fields |
| Request to | who must act | a group or role |
| Responses | entries added over time | who may respond; what a response carries |
| Responses to | who is told of each response | requester, the "to" group, watchers |
| Status | where it stands | the statuses and the allowed steps |
| Hand-off | what happens at the end | payments, ledger, or nothing |

| Type | Request to | Responses to | Statuses | Hand-off |
|---|---|---|---|---|
| Maintenance | maintenance group | requester, maintenance, board | submitted, in progress, pending, completed | invoice to payments (optional) |
| Reimbursement | treasurer; second approver above the configured amount | requester, approvers | submitted, need info, approved, rejected, paid | approved to payments |
| Board approval | board | requester, board | submitted, under review, approved, denied | none |
| Contact / inquiry | office or board | requester (email if outside) | open, answered, closed | none |

Outside the engine: money (payments side), type-specific checks (the type), site choices (configuration).

## Operator answers, round 2 (2026-10-16)

Pattern for most settings: __a configuration default, overridden by parameters passed in__ (per
request type, or per request).

1. __Independent add-on__ (not ngdpbase core, not inside accounting), in __its own repository__:
   `ngdpbase-addons`, a home for several general add-ons with request-response as the first (operator;
   does not exist yet — `ngdpbase-addon-template` does).
2. __Notifications:__ the channels (banner, email, `/profile` "waiting for you") are a choice — config
   default, parameters override.
3. __Receipts and photos:__ core attachments or a private store — config default, parameters
   override.
4. __Who may submit:__ members, __and outsiders__ through a contact-form route like Fairways' external
   contact form. This would enhance ngdpbase's existing `/contact` (#658, #670): today it emails one
   recipient (config `ngdpbase.application.contact.recipient`, else the first admin), has a honeypot
   and rate limit, and keeps a JSONL log of submissions. Idea: a contact submission can become a
   request (type "contact / inquiry") with a number, an owner and responses.
   Outsiders are answered __by email only, for now__ (operator); no follow-it link without an account.
5. __Escalation:__ an escalation list — config default, parameters override — plus a CC list.
6. __Numbering:__ sequential, one sequence per site (for now).
7. __Moving the Fairways history:__ not now, not here.

## Open questions

1. Routing / triage (TBD, see above).
2. How `/contact` hands a submission to the add-on (a core change, for the ngdpbase session).

## Proposed decisions (2026-11-01, awaiting operator confirmation)

- __Storage: SQLite through core, not JSON files.__ The engine declares its own add-on database
  (`ngdpbase.addons.<slug>.database`) and opens it with `DatabaseManager.openAddonDatabase()` from
  `register()`, with tables and the migration ledger prefixed by its slug. It gets encryption, migrations,
  integrity checks and backups from core. JSON only for exports and the API.
- __Dates: ISO 8601__ everywhere (stored and in the API), with time zone offset.
- __Receipts: handled by ngdp-accounting-addons.__ A request or response only links to the receipt;
  accounting stores it and controls who can open it. The engine ends at "approved"; accounting pays and
  posts the ledger entry.
- __Standards:__
  - schema.org: a request is an `Action` (for example `RepairAction`), status maps to
    `ActionStatusType`, a response is a `Comment` or follow-up `Action`, an estimate is a `Quotation`
    or `Offer`, an invoice is `Invoice`; people and units are `Person` and `Accommodation`.
  - RFCs: RFC 5545 (iCalendar) for due dates and scheduled work, RFC 5322 for notification email,
    RFC 9457 for API errors.
  - US accounting (in ngdp-accounting-addons, not here): GAAP with fund accounting (operating and
    reserve funds) and the AICPA guide for common-interest realty associations. The engine hands over
    only an approved amount, a category and a link to the request.

## Next steps (2026-11-01, not filed as issues yet)

- __Read the current Request Form script__ (old `fairways-request-response` project or the responses
  sheet) before designing, so nothing it does is missed.
- __Notifications (still open):__ suggestion is email plus a "waiting for you" list in `/profile`, sent
  from a durable outbox with retry.
- __Migrate the 1,100+ existing requests__ from Sheets into the add-on so history is kept.
- __Interim Google cleanup:__ move the UnitManagement Apps Script and Shared-Fairways-Directory to
  fairwaywebevents; delete the "On change" trigger (`myFunction` only logs rows).
- __First version scope:__ request, responses, status with allowed steps, email, search. Approvals and
  payment hand-off later.

## RequestManager, routing and SLAs (2026-11-01, proposal)

### Jim's idea, restated

Every request goes into one queue. Each kind of request has a set handler: a person, a group, or
code (for example a MaintenanceManager). A handler can pass the request on to someone else. Handlers
report back to RequestManager, which keeps the status, keeps the requester up to date, tells anyone
else who should know, and escalates a request that misses its time limit (SLA) set in configuration.

### What core has today (read 2026-11-01)

__ReviewManager__ (`ngdpbase/src/managers/ReviewManager.ts`, `docs/managers/ReviewManager.md`, #2072)

- One core queue of "requests for review", so add-ons do not build their own. Table `review_requests`
  in core's encrypted application database.
- An add-on files with `fileRequest(ctx, { kind, subject, summary, details, decidePermission, handlerId })`.
  Who decides is a __permission__ (never a role or a named person); holders are found with
  `PolicyDecisionPoint.usersHolding()` and notified.
- Statuses: `open`, `approved`, `rejected` only. A failed handler leaves it `open` with the failure noted.
- Decided on `/reviews` (and the Executive Hub `/executive`). Approve runs the add-on's registered
  handler right away, in the reviewer's request.
- Known gaps (from its own doc): the requester cannot see or withdraw their request; a rejection does not
  tell the add-on; no assignment to a person, no forwarding, no due dates, no escalation; decide takes
  no reviewer inputs.
- Used today by association's occupancy forms: `addons/association/managers/OccupancyManager.ts`
  calls `reviews.fileRequest(...)` with `decidePermission: 'association-review'` and stores the
  returned id in `association_occupancy_submissions.review_id` (ngdpbase#2112, ngdpbase-addons PR #51).
  The forms add-on's "needs review" and accommodation's owner changes also file there (per the doc).

__NotificationManager__ (`ngdpbase/src/managers/NotificationManager.ts`, `docs/managers/NotificationManager.md`)

- In-app notices: type, title, message, level, `targetUsers`, `expiresAt`, `dismissedBy`.
  `createNotification`, `notifyAdmins`, `getUserNotifications`, `dismissNotification`.
- Kept as files in the `notifications` data folder, in the clear (which is why ReviewManager sends only
  a generic "a request is waiting" notice).
- Not found: an email outbox with retry inside NotificationManager. Email goes through __EmailManager__
  (`src/managers/EmailManager.ts`: `send`, `sendTo`, `sendInBackground`, `isDeliveryFailing`); its doc
  mentions "notification escalation" as a user. I found no durable outbox table (searched `src` and
  `docs` for "outbox": nothing).

__BackgroundJobManager__ (`ngdpbase/src/managers/BackgroundJobManager.ts`, #1611, #1715, #1716)

- Runs registered jobs, on demand (`enqueue`, `runNow`) or on a schedule; the scheduler ticks every
  15 seconds, locks each slot, retries up to 3 times with back-off (1, 5, 15 minutes), records runs.
- `registerMaintenance({ id, displayName, everyMs, run })` is the simple "do this every N" door, already
  used by `src/app.ts`, `MediaManager`, `VersioningFileProvider` and the audit providers.
- It has no per-request timers; an SLA check would be one repeating job that looks for overdue requests.

### Overlap

| Need in Jim's idea | ReviewManager | NotificationManager / EmailManager | BackgroundJobManager |
| --- | --- | --- | --- |
| One queue, stored safely | Yes (`review_requests`, encrypted) | No | No |
| Route by request kind | Partly: kind gives a handler and a permission | No | No |
| Handler is a person | No (permission holders only) | No | No |
| Handler is a group | Yes, as "holders of a permission" | No | No |
| Handler is code | Yes, but only on approve | No | Yes, as a job |
| Forward to someone else | No | No | No |
| Status history | No (only final decision) | No | Run history for jobs only |
| Requester kept informed | No (known gap) | Can deliver the message | No |
| Tell others / CC | Deciders only | Yes (in-app; email via EmailManager) | No |
| SLA timers and escalation | No | No | Yes, a repeating check can drive it |

### Recommendation: extend ReviewManager in core, keep the request details in the add-on

- __Not beside it.__ A second queue next to `review_requests` is what ReviewManager was built to stop
  ("no add-on builds its own queue"). Two inboxes for the same people would split the work.
- __Not a full merge into something new.__ ReviewManager already has the hard parts done (encrypted
  storage, permission checks, audit, one-decision-at-a-time, the `/reviews` page) and three users.
- __Extend it__ (candidate for ngdpbase core): add assignment, forwarding, more statuses, a status
  history, requester view, and due dates/escalation. A simple approve/reject review stays a request
  that never uses the extra steps, so today's callers keep working. Whether the name stays
  "ReviewManager" or becomes "RequestManager" is a naming choice for Jim.
- __Add-on (request-response engine) keeps:__ the request form fields, request kinds for the HOA
  (repair, architectural, etc.), numbering, its own records and history import, and its routing and
  SLA settings. It files into core and registers handlers; it does not copy queue, timer or notify code.
- __Notifications:__ use NotificationManager for in-app notices and EmailManager for email. A durable
  outbox with retry is missing today; if needed it should be a candidate for ngdpbase core (could be a
  BackgroundJobManager job with its built-in retry), not built in the add-on.
- __SLA timers:__ one `registerMaintenance` job (for example every 5 minutes) that finds overdue
  requests and escalates. No new scheduler.

### Proposed shape

__Statuses__ (candidate for ngdpbase core): `new` → `assigned` → `in-progress` →
`waiting-on-requester` → `resolved` → `closed`; plus `approved`, `rejected`, `withdrawn`, `escalated`
(a flag or event, so the real status is not lost). Allowed steps listed in one place.

__Routing config example__ (add-on settings, read through core config):

```json
"ngdpbase.addons.request-response.routing": {
  "repair":        { "handler": { "permission": "maintenance-handle" }, "cc": ["manager@example.org"] },
  "architectural": { "handler": { "permission": "arc-review" } },
  "pest-control":  { "handler": { "code": "maintenance.pest" } },
  "default":       { "handler": { "email-group": "board@example.org" } }
}
```

A handler is one of: a permission (group), an email group set in configuration (the only way to route to a single person, operator 2026-11-01), or code registered by an add-on.

__Forwarding history__ (one row per step, candidate for ngdpbase core): request id, time, from, to,
action (`filed`, `assigned`, `forwarded`, `status-changed`, `note`, `escalated`), short note. The same
rule as today applies: personal words stay in the encrypted database, notices say only "request #123
needs you".

__SLA config example:__

```json
"ngdpbase.addons.request-response.sla": {
  "repair": {
    "respond-within": "P2D",
    "resolve-within": "P14D",
    "pause-while": ["waiting-on-requester"],
    "escalate": [
      { "after": "P2D",  "to": { "permission": "maintenance-lead" } },
      { "after": "P7D",  "to": { "permission": "executive-read" }, "cc": ["board@example.org"] }
    ]
  },
  "default": { "respond-within": "P3D", "resolve-within": "P30D" }
}
```

Times are ISO 8601 durations. The clock stops while the request is `waiting-on-requester` and starts
again when they reply. Each escalation step fires once, is written to the history, and tells the
requester only that it is "being looked at by more people" (wording TBD).

__Escalation chain:__ handler → lead → board (Executive Hub already shows requests for permissions the
`executive` role holds). Parameters on a single request may override the config default, as already
decided above.

### Open questions

1. ~~Rename ReviewManager to RequestManager?~~ __Decided (operator, 2026-11-01): yes, rename to RequestManager.__
2. ~~Can a handler be a single named person?~~ __Decided (operator, 2026-11-01): yes, but only as an email group, set in configuration entries.__
3. ~~Should a rejection or status change call the add-on back?~~ __Decided (operator, 2026-11-01): yes, call the add-on back on every status change.__
4. ~~Durable email outbox with retry?~~ __Decided (operator, 2026-11-01): no outbox for now; EmailManager sends once over SMTP as today.__
5. ~~Business or calendar days for SLAs?~~ __Decided (operator, 2026-11-01): business days (Mon–Fri), no holiday list.__
6. ~~What can the requester do in `/profile`?~~ __Decided (operator, 2026-11-01): view, reply and withdraw.__
   - __"My requests" page (operator, 2026-11-01):__ a plugin on a page where anyone sees their own requests.
     Signed-in users see all of theirs. Outsiders (contact-form submitters, no account) use a private link
     from their confirmation email that shows only that one request. The link is long and unguessable and
     expires when the request is closed. Reply and withdraw work from the same page.
7. ~~Does the handler enter values when acting?~~ __Decided (operator, 2026-11-01): all three, set per request type in configuration: defined fields (note, amount, date, file), a free-text note only, or nothing (just pick the action).__
8. ~~Does association's occupancy review move onto the new statuses?~~ __Decided (operator, 2026-11-01): yes, adopt the new statuses. What the requester sees may differ: each request type can map statuses to its own requester-facing labels.__
