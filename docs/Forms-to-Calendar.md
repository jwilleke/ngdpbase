# Forms-to-Calendar Architecture

> __Related issues:__
>
> - [#571](https://github.com/jwilleke/ngdpbase/issues/571) — FormsPlugin: `section` field type
> - [#572](https://github.com/jwilleke/ngdpbase/issues/572) — FormsPlugin: prefill from user context
> - [#573](https://github.com/jwilleke/ngdpbase/issues/573) — FormsPlugin: proxySubmission UX / field order
> - [#574](https://github.com/jwilleke/ngdpbase/issues/574) — Forms Admin: UI builder to create/manage form definitions (admin only)

Data flow for the clubhouse reservation system: a wiki form submission that becomes a calendar event.

## Components

| Component | File | Role |
|---|---|---|
| Form definition | `data/forms/definitions/clubhouse-reservation.json` | Declares fields, handler key, proxy flag |
| FormsPlugin | `addons/forms/plugins/FormsPlugin.ts` | Renders form HTML in wiki page |
| Forms API route | `addons/forms/routes/api.ts` | Receives POST, validates, persists, calls handler |
| FormsDataManager | `addons/forms/managers/FormsDataManager.ts` | Loads definitions, stores submissions |
| Calendar handler | `addons/calendar/index.ts` `register()` | Registered at startup, conflict-checks and creates event |
| CalendarDataManager | `addons/calendar/managers/CalendarDataManager.ts` | Event store, conflict detection |
| Calendar config | `data/config/app-custom-config.json` | `clubhouse` calendar: `workflow: reservation` |

---

## Startup — Handler Registration

```
AddonsManager.loadAddons()
  → forms addon registers first (calendar depends on it)
  → calendar addon.register()
      engine.getManager('FormsAddon')
        .registerHandler('clubhouse-reservation', handler)
```

The handler is a closure over `CalendarDataManager`. If the forms addon is not loaded, the handler is silently skipped and submissions will be stored but not converted to events.

---

## Request Flow

```
Browser
  │
  │  GET /view/clubhouse-calendar
  ▼
RenderingManager
  │  encounters [{Form id='clubhouse-reservation'}]
  ▼
PluginManager.execute('Form', params, context)
  │  context.userContext = session user (for prefill)
  ▼
FormsPlugin.execute()
  │  FormsDataManager.getDefinition('clubhouse-reservation')
  │  resolves optionsSources, prefill values
  │  renders <form data-ngdp-form="clubhouse-reservation">
  ▼
Browser renders form HTML + forms-submit.js
```

```
User fills form → clicks Submit
  │
  │  POST /api/forms/submit/clubhouse-reservation
  │  body: { date, startTime, endTime, name, email, phone,
  │          address, description, onBehalfOf?: {...} }
  ▼
forms/routes/api.ts
  │
  ├─ FormsDataManager.getDefinition()     validate form exists
  ├─ Zod field validation                 400 on failure
  ├─ time range check (end > start)       400 on failure
  │
  ├─ build FormSubmission {
  │    id, formId, submittedAt, submittedBy,
  │    onBehalfOf?, data, status: 'pending'
  │  }
  │
  ├─ FormsDataManager.save(submission)
  │    → data/forms/submissions/clubhouse-reservation/<uuid>.json
  │
  ├─ formsAddon.callHandler('clubhouse-reservation', submission, ctx)
  │
  ▼
calendar/index.ts  registerHandler callback
  │
  ├─ resolve person
  │    onBehalfOf.name/email present?  → use onBehalfOf
  │    otherwise                       → use data.name / data.email
  │
  ├─ build ISO timestamps
  │    start = data.date + 'T' + data.startTime
  │    end   = data.date + 'T' + data.endTime
  │
  ├─ CalendarDataManager.checkConflict('clubhouse', start, end)
  │    ├─ conflict found → return { ok: false, error: 'slot taken' }
  │    └─ clear         → continue
  │
  ├─ CalendarDataManager.create({
  │    calendarId:  'clubhouse',
  │    title:       'Reservation — <person.name>',
  │    start, end,
  │    description: data.description,
  │    createdBy:   submission.submittedBy,
  │    _private: { requester, requesterEmail, address, phone, submittedBy }
  │  })
  │    → data/calendar/clubhouse.json  (appended)
  │
  └─ return { ok: true, calendarEventId: event.id }
```

```
Back in forms/routes/api.ts
  │
  ├─ handler returned ok:false?
  │    → 409 { ok: false, error: '...' }   (submission stays pending)
  │
  ├─ update submission.handlerResult = { ok, calendarEventId }
  │
  ├─ EmailManager.sendTo(submitterEmail, confirmation)   (if mail enabled)
  │
  ├─ NotificationManager.notify(notifyRole='clubhouse-manager',
  │    "New reservation submitted by <user>")
  │
  └─ 201 { ok: true, submissionId }
```

---

## Data Stores

```
data/
├── forms/
│   ├── definitions/
│   │   └── clubhouse-reservation.json     ← form schema (fields, handler key)
│   └── submissions/
│       └── clubhouse-reservation/
│           └── <uuid>.json                ← one file per submission
│               {
│                 id, formId, submittedAt, submittedBy,
│                 onBehalfOf?, data, status, handlerResult
│               }
│
└── calendar/
    └── clubhouse.json                     ← all clubhouse events (flat array)
        {
          id, calendarId, title, start, end,
          description, createdBy, status,
          _private: { requester, requesterEmail, address, phone }
        }
```

---

## Conflict Detection

`CalendarDataManager.checkConflict(calendarId, start, end)` filters all events in the calendar where the ISO intervals overlap:

```
overlap = existingStart < requestedEnd && existingEnd > requestedStart
```

Returns `true` if any overlap is found. The handler returns a user-visible error; the submission remains in `data/forms/submissions/` with `status: pending` and `handlerResult.ok: false`.

---

## Proxy Submission

When a staff member submits on behalf of a resident (`proxySubmission: true` in the form definition):

```
form body
  onBehalfOf.name    → event title / _private.requester
  onBehalfOf.email   → confirmation email recipient
  onBehalfOf.phone   → _private.phone
  onBehalfOf.address → _private.address

  data.name  }  used as submitter identity
  data.email }  (stored as submission.submittedBy)
```

The calendar event title is always `Reservation — <resident name>`, regardless of who submitted.

---

## Admin Surfaces

| URL | What it shows |
|---|---|
| `/addons/forms` | All forms, submission counts, status filter |
| `/addons/forms/clubhouse-reservation/submissions` | Per-submission detail, mark processed/rejected |
| `/addons/calendar` | Full calendar management, edit/delete events |
| `/api/calendar/clubhouse/feed.ics` | RFC 5545 iCal feed for external calendar apps |

---

## Configuration Keys

```jsonc
// data/config/app-custom-config.json

"ngdpbase.addons.forms.enabled": true,
"ngdpbase.addons.forms.dataPath": "./data/forms",
"ngdpbase.addons.forms.notifyRole": "admin",

"ngdpbase.addons.calendar.enabled": true,
"ngdpbase.addons.calendar.dataPath": "./data/calendar",
"ngdpbase.addons.calendar.clubhouse-manager-email": "jim@willeke.com",
"ngdpbase.addons.calendar.calendars.clubhouse.enabled": true,
"ngdpbase.addons.calendar.calendars.clubhouse.workflow": "reservation",
"ngdpbase.addons.calendar.calendars.clubhouse.visibility": "authenticated"
```

The `workflow: reservation` flag is checked by the calendar reservation route before accepting direct `POST /api/calendar/reservations` requests. The forms handler bypasses this route and writes directly through `CalendarDataManager`.
