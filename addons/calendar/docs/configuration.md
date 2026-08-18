# Calendar Add-on — Configuration Reference

## Top-level keys

All keys live under `ngdpbase.addons.calendar` in `app-custom-config.json`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
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
| `visibility` | `public` \| `authenticated` \| `private` | __public__: any visitor. __authenticated__: logged-in users. __private__: `admin` or `clubhouse-manager` roles only. |
| `enabled` | boolean | Whether this calendar is active. Disabled calendars are excluded from all API responses and the admin dashboard. |

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

Events with `class: CONFIDENTIAL` are always excluded from the marquee output.

## Email notifications

When `EmailManager` is configured and a reservation is submitted:

- The __requester__ receives a confirmation to their account email.
- The __clubhouse-manager-email__ receives a `[Manager]`-prefixed copy.

Email delivery is fire-and-forget — a failed send does not fail the reservation.
If `EmailManager` is not configured the reservation still succeeds silently.
