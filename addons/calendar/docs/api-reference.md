# Calendar Add-on — REST API Reference

Base path: `/api/calendar`

All JSON requests must include `Content-Type: application/json`.
Authentication uses the ngdpbase session cookie (same as the wiki UI).

---

## Events

### GET /api/calendar/events

Return events as a FullCalendar-compatible JSON array.

__Auth__: none for `public` calendars. A `url` stored before the address rule (see POST) is left out of each event returned, and the event is kept. Events of an `authenticated` calendar are returned to holders of `calendar-read` (every signed-in account), and events of a `private` calendar to holders of `calendar-manage`. Events of a calendar the caller may not see are left out of the list, whatever `calendarId` asks for.

#### Query parameters

| Param | Description |
|-------|-------------|
| `calendarId` | Filter to a single calendar |
| `start` | ISO 8601 range start (FullCalendar passes this automatically) |
| `end` | ISO 8601 range end |

__Privacy__: `_private` blocks are stripped for callers who are not the event's
requester and do not hold `admin` or `clubhouse-manager`.

__Response__ `200 OK`

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Annual BBQ",
    "start": "2026-07-04T12:00:00",
    "end":   "2026-07-04T15:00:00",
    "extendedProps": {
      "calendarId":  "events",
      "description": "Annual summer BBQ",
      "status":      "CONFIRMED"
    }
  }
]
```

---

### POST /api/calendar/events

Create a new event on a `managed` calendar.

__Auth__: the permission the event's calendar names in its `manage-permission` setting, `calendar-manage` when it names none (an event with no `calendarId` goes to the `default` calendar). A permission the site has not declared is refused for everyone. A body with a `_private` block also needs `calendar-manage`, whatever the calendar names.

#### Request body

| Field | Required | Description |
|-------|----------|-------------|
| `calendarId` | no | Target calendar ID, text (default: `default`). Anything that is not text is refused with `400` |
| `title` | yes | Event title |
| `start` | yes | A date or ISO 8601 datetime the calendar can read (`2026-12-01`, `2026-12-01T10:00:00`); anything else is refused with `400` |
| `end` | no | Same rule as `start` when sent; leave it out for none |
| `allDay` | no | boolean |
| `description` | no | Free text |
| `location` | no | Venue |
| `color` | no | CSS colour string |
| `status` | no | `CONFIRMED` `TENTATIVE` `CANCELLED` (default: `CONFIRMED`) |
| `url` | no | Link opened on event click. Must be empty, a relative address (`/wiki/Page`, `#top`), a protocol-relative one (`//host/page`, which takes the page's own http or https), or start with `http:`, `https:` or `mailto:` (any case); anything else, and anything with a control character such as a tab or newline, is refused with `400`. A relative address with a colon before its first slash, such as `Page:Name`, reads as a scheme and is refused: write `./Page:Name`. `null` is refused too; send `""` to clear a url |
| `organizer` | no | Text: an email address or a display name. A line break, NUL or other control character is refused with `400`, because the value is written into the `.ics` feed |

__Response__ `201 Created` — full `FullCalendarEvent` object. A `url` stored before the rule above existed is left out of every event the API returns (list, single, search and the `.ics` feed); the event itself is kept.

#### Errors

| Code | Reason |
|------|--------|
| `401` | Not authenticated |
| `403` | Missing the permission the calendar names (or `calendar-manage`, for a body with a `_private` block) |
| `400` | Missing `title` or `start`, a `start` or `end` that is not a date, a `calendarId` that is not text, a `url` that is not allowed, or an `organizer` that is not text or holds a control character |

---

### GET /api/calendar/events/search

Keyword search across event titles and descriptions.

__Auth__: none for `public` calendars. Results are limited to the calendars the caller may see, as for the list endpoint. A `url` stored before the address rule (see POST) is left out of each result, and the event is kept.

#### Query parameters

| Param | Description |
|-------|-------------|
| `q` | Search string (case-insensitive) |
| `calendarId` | Optional calendar filter |

__Response__ `200 OK` — array of `FullCalendarEvent`.

---

### GET /api/calendar/events/:id

Return a single event by UUID.

__Auth__: same visibility rules as the list endpoint.

__Response__ `200 OK` — single `FullCalendarEvent`. A `url` stored before the address rule (see POST) is left out, and the event is kept.

__Errors__: `404` if not found, or if the event's calendar is not visible to the caller (an `authenticated` calendar to a caller without `calendar-read`, a `private` one or one the configuration does not name without `calendar-manage`, and a disabled one to anyone).

---

### PUT /api/calendar/events/:id

Partial update of an existing event. Send only the fields to change.
`id`, `created`, and `dtstamp` are protected and ignored in the patch.

__Auth__: the permission the event's calendar names in its `manage-permission` setting, `calendar-manage` when it names none. A patch that changes `calendarId` needs the permission of both calendars.

__Response__ `200 OK` — updated `FullCalendarEvent`.

__Errors__: `400` if `calendarId` is not text, `url` is not allowed, `start` or `end` is not a date, or `organizer` is not text or holds a control character (same rules as create; send `url: ""` to clear a url, `null` is refused), `401`, `403`, `404`, `409` if the event was moved by another request while the check ran.

---

### DELETE /api/calendar/events/:id

Delete an event.

__Auth__: the permission the event's calendar names in its `manage-permission` setting, `calendar-manage` when it names none.

__Response__ `204 No Content`

__Errors__: `401`, `403`, `404`, `409` if the event was moved by another request while the check ran.

---

## Reservations

### POST /api/calendar/reservations

Submit a reservation request. The target calendar must have `workflow: reservation`.
Events are stored as `CLASS: CONFIDENTIAL` and are invisible in the public feed.
Email notifications are sent to the requester and the manager.

__Auth__: authenticated (any logged-in user)

#### Request body

| Field | Required | Description |
|-------|----------|-------------|
| `calendarId` | yes | Must be a `reservation`-workflow calendar |
| `title` | yes | Description of the reservation |
| `start` | yes | ISO 8601 datetime |
| `end` | yes | ISO 8601 datetime |
| `description` | no | Additional details |
| `location` | no | Specific area / room |
| `notes` | no | Notes to the manager (stored in `_private`) |

__Response__ `201 Created` — `FullCalendarEvent` with `_private` visible to the requester.

#### Errors

| Code | Reason |
|------|--------|
| `400` | Missing required field, or calendar does not accept reservations |
| `401` | Not authenticated |
| `409` | Time slot conflicts with an existing reservation |

---

### DELETE /api/calendar/reservations/:id

Cancel a reservation. The requester may cancel their own; managers and admins
may cancel any reservation.

__Auth__: authenticated

__Response__ `204 No Content`

__Errors__: `401`, `403` (not allowed to reserve at all), `404`. A caller who is neither the requester nor a manager gets `404` for a reservation that exists and for one that does not, with the same body.

---

## ICS Feed

### GET /api/calendar/:calendarId/feed.ics

RFC 5545 iCalendar subscription feed for a single calendar. `CONFIDENTIAL` events
are excluded. An event whose start or end cannot be read as a date is left out, and the rest of the feed is still served. Control characters in an event's text, such as a stored line break in a title or organizer, are dropped, so no event's text can add a line to the feed; a line break in a description is written as an escaped `\n`. A `url` stored before the address rule is left out of its event. Subscribe from Apple Calendar, Google Calendar, or any CalDAV client.

__Auth__: none for `public` calendars. An `authenticated` calendar's feed needs `calendar-read` (a signed-in account) and a `private` calendar's `calendar-manage`; for anyone else the feed answers `404`. A calendar app that cannot sign in to the site therefore cannot subscribe to a calendar that is not public.

__Response__ `200 OK` with `Content-Type: text/calendar`

```
BEGIN:VCALENDAR
PRODID:-//ngdpbase//Calendar//EN
VERSION:2.0
BEGIN:VEVENT
UID:550e8400-e29b-41d4-a716-446655440000@ngdpbase
SUMMARY:Annual BBQ
DTSTART:20260704T120000
DTEND:20260704T150000
STATUS:CONFIRMED
CLASS:PUBLIC
END:VEVENT
END:VCALENDAR
```

---

## Admin dashboard

### GET /admin/calendar

Management dashboard rendered as HTML. Shows all enabled calendars; reservation
calendars include `_private` columns. Provides create/edit/delete UI for events.

__Auth__: `admin` or `clubhouse-manager`

__Response__ `200 OK` HTML page, or `401` redirect to login.

---

## Common error shape

All error responses use:

```json
{ "error": "Human-readable message" }
```
