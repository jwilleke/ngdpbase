# calendar — ngdpbase Add-on

Event calendar with a [FullCalendar](https://fullcalendar.io/) UI (v6, MIT licence).

## Features

- Month / week / day / list views
- JSON event store (no extra database required)
- FullCalendar loaded from CDN — no build step
- REST API compatible with FullCalendar's JSON feed format
- Wiki markup directive `[{Calendar}]`

## Installation

1. Point your ngdpbase instance at this repo's `addons/` directory:

   ```json
   // $FAST_STORAGE/config/app-custom-config.json
   {
     "ngdpbase.managers.addons-manager.addons-path": "/path/to/cal-addon/addons",
     "ngdpbase.addons.calendar.enabled": true,
     "ngdpbase.addons.calendar.dataPath": "./data/calendar"
   }
   ```

2. Run `npm install` inside `addons/calendar/` (installs `uuid`):

   ```sh
   cd addons/calendar && npm install
   ```

3. Restart ngdpbase: `./server.sh restart`

4. Add `[{Calendar}]` to any wiki page.

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `ngdpbase.addons.calendar.enabled` | `false` | Enable this add-on |
| `ngdpbase.addons.calendar.dataPath` | `./data/calendar` | Where events.json is stored |

### Who may manage the calendar

Management (create, edit, delete events; see private reservation details; cancel any reservation) asks policy for the `calendar-manage` permission, which this add-on declares in `config/default-config.json` and grants to `admin`. To let another role manage it, grant the permission in your instance's `app-custom-config.json`, for example by adding a policy of your own:

```json
{
  "ngdpbase.access.policies": [
    { "id": "clubhouse-manager-calendar", "name": "Clubhouse manager runs the calendar", "priority": 90, "effect": "allow",
      "subjects": [{ "type": "role", "value": "clubhouse-manager" }], "resources": [{ "type": "page", "pattern": "*" }],
      "actions": ["calendar-manage"] }
  ]
}
```

The add-on never names a role (#1198, #1220).

## Markup Directive

```
[{Calendar}]
[{Calendar view='timeGridWeek'}]
[{Calendar calendarId='project-x' height='500' editable='false'}]
```

| Parameter | Default | Options |
|-----------|---------|---------|
| `view` | `dayGridMonth` | `dayGridMonth` `timeGridWeek` `timeGridDay` `listWeek` |
| `calendarId` | *(all)* | Filter to a named logical calendar |
| `height` | `650` | Calendar height in pixels |
| `editable` | `true` | Allow drag-drop/resize |
| `weekNumbers` | `false` | Show ISO week numbers |
| `firstDay` | `0` | `0`=Sunday, `1`=Monday |

## API

All endpoints are under `/api/calendar`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/calendar/events` | List events (FullCalendar feed, accepts `?start=&end=&calendarId=`) |
| `POST` | `/api/calendar/events` | Create event |
| `GET` | `/api/calendar/events/search?q=` | Keyword search |
| `GET` | `/api/calendar/events/:id` | Get single event |
| `PUT` | `/api/calendar/events/:id` | Update event (partial) |
| `DELETE` | `/api/calendar/events/:id` | Delete event |

### Event Object

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Team standup",
  "start": "2026-04-07T09:00:00",
  "end":   "2026-04-07T09:30:00",
  "allDay": false,
  "description": "Daily sync",
  "url": "/wiki/StandupNotes",
  "calendarId": "default",
  "color": "#3b82f6",
  "created": "2026-04-05T00:00:00.000Z",
  "updated": "2026-04-05T00:00:00.000Z"
}
```

### Create Event Example

```sh
curl -X POST http://localhost:3000/api/calendar/events \
  -H 'Content-Type: application/json' \
  -d '{"title":"Team standup","start":"2026-04-07T09:00:00","end":"2026-04-07T09:30:00"}'
```
