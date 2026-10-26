# Calendar Add-on — Data Model

## CalendarEvent (internal storage)

Stored in `${dataPath}/<calendarId>.json` as a JSON array.
Field names follow FullCalendar's `EventInput` for UI compatibility.

```typescript
interface CalendarEvent {
  // Core
  id:          string;   // UUID v4
  title:       string;
  start:       string;   // ISO 8601 datetime
  end?:        string;   // ISO 8601 datetime
  allDay?:     boolean;
  description?: string;
  url?:        string;   // link opened on event click
  calendarId:  string;   // logical calendar identifier
  color?:      string;   // CSS colour string
  createdBy?:  string;   // identity @id of creator (#2041); a name with no account as given

  // Timestamps
  created:  string;      // ISO 8601 — record created
  updated:  string;      // ISO 8601 — record last modified
  dtstamp?: string;      // ISO 8601 — RFC 5545 DTSTAMP (re-stamped on every write)

  // RFC 5545 extension fields
  location?:  string;
  status?:    'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  class?:     'PUBLIC' | 'PRIVATE' | 'CONFIDENTIAL';
  transp?:    'OPAQUE' | 'TRANSPARENT';
  organizer?: string;    // email address or display name
  rrule?:     string;    // RFC 5545 RRULE value string

  // Private reservation metadata
  _private?: {
    requester?:      string;   // identity @id of the requester (#2041); through forms, the name typed on the form
    requesterEmail?: string;
    notes?:          string;
    [key: string]:   unknown;
  };
}
```

### Field defaults on create

| Field | Default |
|-------|---------|
| `status` | `CONFIRMED` |
| `class` | `PUBLIC` (managed events); `CONFIDENTIAL` (reservations) |
| `transp` | `OPAQUE` |
| `allDay` | `false` |
| `calendarId` | `'default'` |

### RFC 5545 mapping

| `CalendarEvent` field | RFC 5545 property | Notes |
|-----------------------|-------------------|-------|
| `title` | `SUMMARY` | |
| `start` | `DTSTART` | |
| `end` | `DTEND` | Defaults to start + 1 hour in `.ics` output |
| `id` | `UID` | Suffixed with `@ngdpbase` in `.ics` |
| `description` | `DESCRIPTION` | |
| `location` | `LOCATION` | |
| `status` | `STATUS` | |
| `class` | `CLASS` | |
| `transp` | `TRANSP` | `OPAQUE`→time blocked; `TRANSPARENT`→free |
| `dtstamp` | `DTSTAMP` | |
| `organizer` | `ORGANIZER` | `mailto:` prefix added if value is an email |
| `rrule` | `RRULE` | Raw RRULE value string |

---

## FullCalendarEvent (API response)

Returned by all GET/POST/PUT API endpoints. Translates internal field names to
FullCalendar's `EventInput` format; non-UI fields go into `extendedProps`.

```typescript
interface FullCalendarEvent {
  id:        string;
  title:     string;
  start:     string;
  end?:      string;
  allDay?:   boolean;
  url?:      string;
  color?:    string;
  extendedProps?: {
    calendarId:  string;
    description?: string;
    location?:   string;
    status?:     string;
    organizer?:  string;
    _private?:   Record<string, unknown>;  // only for authorised callers
  };
}
```

---

## CalendarConfig (per-calendar)

Defined in `app-custom-config.json` under
`ngdpbase.addons.calendar.calendars.<id>`.

```typescript
interface CalendarConfig {
  enabled?:   boolean;
  workflow:   'reservation' | 'managed';
  visibility: 'public' | 'authenticated' | 'private';
}
```

---

## Storage layout

```
${dataPath}/           (e.g. /Volumes/hd2/jimstest-wiki/data/calendar/)
  clubhouse.json       ← all events with calendarId === "clubhouse"
  tennis-court.json
  events.json
```

Each file is a flat JSON array — no nested structure. `CalendarDataManager.save()`
groups in-memory events by `calendarId` and writes each group atomically.

### Load behaviour

`CalendarDataManager.load()` reads every `*.json` file in `dataPath` at startup.
Files created externally (e.g. imported `.ics` converted to JSON) will be picked
up on the next server restart.

---

## `_private` visibility rules

The `_private` block is persisted with the event but stripped from API responses
unless the caller satisfies one of:

1. Has role `admin`
2. Has role `clubhouse-manager`
3. `event._private.requester` is the caller's identity `@id`, or their username on a reservation stored before [#2041](https://github.com/jwilleke/ngdpbase/issues/2041) and not yet converted (owner sees their own)

Stripping is performed by `CalendarDataManager.stripPrivate(event, userCtx)`.

At start-up the add-on converts stored usernames once ([#2041](https://github.com/jwilleke/ngdpbase/issues/2041)): every `createdBy`, and a reservation's `_private.requester` and `_private.submittedBy`, that is still a username becomes the user's identity `@id`, under the system context, and the events are saved once. A reservation filed through forms keeps its `requester` (the name typed on the form). Values already an `@id`, `anonymous` and the system principal are left alone, so a second start writes nothing. A username with no account is left as it is and reported, counts only: a log line and the admin dashboard's "needs your attention" list.
The `.ics` feed always excludes `CONFIDENTIAL` events entirely.
