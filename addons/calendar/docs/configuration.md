# Calendar Add-on — Configuration Reference

## Top-level keys

All keys live under `ngdpbase.addons.calendar` in `app-custom-config.json`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `manage-permission` | permission name | Optional. The permission that lets someone add, edit and delete this calendar's events. Defaults to `calendar-manage`. The name must be declared by the site; a name that is not declared, or a value that is not text, leaves nobody able to change this calendar's events. Cancelling a reservation and seeing private reservation details stay on `calendar-manage` for every calendar. See [Who may manage the calendar](../README.md#who-may-manage-the-calendar). |
| `enabled` | boolean | `false` | Enable the calendar add-on |
| `dataPath` | string | `./data/calendar` | Directory for per-calendar JSON files. Supports `${FAST_STORAGE}` expansion. |
| `clubhouse-manager-email` | string | — | Email address that receives reservation notification copies |
| `calendars` | object | — | Map of calendar IDs to `CalendarConfig` objects (see below) |

## Per-calendar config (`calendars.<id>`)

```json
"ngdpbase.addons.calendar.calendars": {
  "clubhouse": {
    "workflow":   "reservation",
    "visibility": "public",
    "enabled":    true
  },
  "tennis-court": {
    "workflow":   "reservation",
    "visibility": "authenticated",
    "enabled":    true
  },
  "events": {
    "workflow":   "managed",
    "visibility": "public",
    "enabled":    true
  }
}
```

| Field | Values | Description |
|-------|--------|-------------|
| `workflow` | `reservation` \| `managed` | __reservation__: members submit booking requests via `POST /api/calendar/reservations`; conflict detection enforced; events stored as `CLASS: CONFIDENTIAL`. __managed__: admin/clubhouse-manager create events directly via `POST /api/calendar/events`. |
| `visibility` | `public` \| `authenticated` \| `private` | Who may see the calendar's events, in the calendar view, the API, the `.ics` feed and the marquee text. __public__: any visitor. __authenticated__: people holding the `calendar-read` permission, which the add-on grants to every signed-in account. __private__: holders of the `calendar-manage` permission. Every calendar must have a `visibility`. A calendar with no `visibility`, or with a value that is none of the three, is read as `private`: only holders of `calendar-manage` see it, and the calendar admin page names each calendar that has no setting. |
| `enabled` | boolean | Whether this calendar is active. It counts as enabled only when it is missing or `true`; any other value leaves the calendar out of the API, the `.ics` feed, the marquee text, reservations and the admin dashboard, for everyone. |

### Calendars the configuration does not name

Only a calendar named under `calendars`, with `visibility` set to `public`, can be public. A calendar with events but no entry here (an id mistyped, or an entry removed) is read as `private`, so only holders of `calendar-manage` see its events. This includes the `default` calendar that holds an event created without a `calendarId`.

The Clubhouse reservation form saves its events to the calendar `clubhouse`. A site that uses it must have a `clubhouse` entry, with the `visibility` its members should have, or the reservations show only to holders of `calendar-manage`:

```json
"ngdpbase.addons.calendar.calendars": {
  "clubhouse": { "workflow": "reservation", "visibility": "authenticated", "enabled": true }
}
```

### When a change applies

`visibility`, `enabled`, `manage-permission` and `workflow` are read from the current configuration on each request, so a change applies on the next request, with no restart; that includes the admin dashboard and `POST /api/calendar/reservations`. `clubhouse-manager-email` is read when the site starts.

Reservations follow the same two settings. `POST /api/calendar/reservations` answers "does not accept reservations" (400) for a calendar the requester may not see under its `visibility`, for a disabled one and for an id the configuration does not name, with the same message for all three. So a reservation calendar needs a `visibility` its requesters meet.

The Clubhouse reservation form follows them too: it reserves only on a `clubhouse` calendar that the person may see, that is enabled and that has `workflow: reservation`. For a submission that is held for review (a form set to need review), the person checked is the reviewer who approves it, not the submitter: a reviewer who may see the calendar carries the reservation out, and one who may not gets the same refusal. Otherwise it answers "This calendar does not accept reservations.", the same text for every case and whether the time is taken or free.

A site policy with no `actions`, or with `*`, grants `calendar-read`, `calendar-reserve` and `calendar-manage` alike, so scope each policy to the actions it means to grant.

## Full example

```json
{
  "ngdpbase.addons.calendar.enabled": true,
  "ngdpbase.addons.calendar.dataPath": "${FAST_STORAGE}/calendar",
  "ngdpbase.addons.calendar.clubhouse-manager-email": "manager@example.com",
  "ngdpbase.addons.calendar.calendars": {
    "clubhouse": {
      "workflow":   "reservation",
      "visibility": "public",
      "enabled":    true
    },
    "tennis-court": {
      "workflow":   "reservation",
      "visibility": "authenticated",
      "enabled":    true
    },
    "events": {
      "workflow":   "managed",
      "visibility": "public",
      "enabled":    true
    }
  }
}
```

## Storage layout

Each calendar's events are stored in a separate JSON file:

```
${dataPath}/
  clubhouse.json
  tennis-court.json
  events.json
```

Files are created automatically on first write. Each file is a JSON array of
`CalendarEvent` objects. See [data-model.md](./data-model.md) for the full schema.

## `[{Calendar}]` plugin parameters

Configured per wiki page, not in `app-custom-config.json`.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `calendarId` | *(all)* | Show only events from this calendar ID |
| `view` | `dayGridMonth` | Initial FullCalendar view: `dayGridMonth` `timeGridWeek` `timeGridDay` `listWeek` |
| `height` | `650` | Calendar height in pixels |
| `editable` | `true` | Allow drag-and-drop / resize (visual only — API auth still applies) |
| `weekNumbers` | `false` | Show ISO week numbers |
| `firstDay` | `0` | First day of week: `0` = Sunday, `1` = Monday |
| `modal` | `false` | Enable create/edit/delete modal for `managed` calendars |

## `toMarqueeText()` options

Used in the `[{MarqueePlugin}]` `fetch` param.

```
[{MarqueePlugin fetch='CalendarDataManager.toMarqueeText(calendarId=events,days=30,limit=5)'}]
```

| Option | Default | Description |
|--------|---------|-------------|
| `calendarId` | *(all)* | Restrict to one calendar |
| `days` | `30` | Look-ahead window in days |
| `separator` | `•` (bullet) | Text between items |
| `limit` | `0` (unlimited) | Max number of items |

Events with `class: CONFIDENTIAL` are always excluded from the marquee output. So are the events of a calendar the viewer may not see under its `visibility`, and of a disabled one; `limit` counts only what is left. A visitor who is not signed in gets the public calendars only.

## Email notifications

When `EmailManager` is configured and a reservation is submitted:

- The __requester__ receives a confirmation to their account email.
- The __clubhouse-manager-email__ receives a `[Manager]`-prefixed copy.

Email delivery is fire-and-forget — a failed send does not fail the reservation.
If `EmailManager` is not configured the reservation still succeeds silently.
