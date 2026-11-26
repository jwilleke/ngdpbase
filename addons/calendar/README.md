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

Management (create, edit, delete the events of every calendar that does not name its own `manage-permission`, and of every `reservation` calendar; see private reservation details; cancel any reservation) asks policy for the `calendar-manage` permission, which this add-on declares in `config/default-config.json` and grants to `admin`. To let another role manage it, grant the permission in your instance's `app-custom-config.json`, for example by adding a policy of your own:

```json
{
  "ngdpbase.access.policies": [
    { "id": "clubhouse-manager-calendar", "name": "Clubhouse manager runs the calendar", "effect": "allow",
      "subjects": [{ "type": "role", "value": "clubhouse-manager" }], "resources": [{ "type": "page", "pattern": "*" }],
      "actions": ["calendar-manage"] }
  ]
}
```

The add-on never names a role (#1198, #1220).

#### A calendar with its own manage permission

By default `calendar-manage` decides who adds, edits and deletes events on every calendar that does not name its own `manage-permission`, and it always decides for a `reservation` calendar and for private details. A calendar can name a different permission in its `manage-permission` setting, so a group can look after one calendar and nothing else, for example the board adding events to the association's events calendar without being able to touch the clubhouse calendar:

```json
"ngdpbase.addons.calendar.calendars": {
  "clubhouse":          { "workflow": "reservation", "visibility": "authenticated", "enabled": true },
  "association-events": { "workflow": "managed", "visibility": "authenticated", "enabled": true,
                          "manage-permission": "association-event-post" }
}
```

The permission must be declared by the site (an add-on or your `app-custom-config.json` under `ngdpbase.permissions.definitions`) and granted by a policy. Once a calendar names its own permission, `calendar-manage` alone no longer lets someone change its events. A name the site has not declared, or a value that is not text, leaves nobody able to change that calendar's events until it is fixed. A calendar with no `manage-permission` asks `calendar-manage`, as before.

Cancelling a reservation and seeing private reservation details always ask `calendar-manage`, whatever a calendar names. So does every change to a calendar whose `workflow` is `reservation` (its `manage-permission` is ignored), and writing, editing or deleting an event that carries private details (a `_private` block). A permission nearly everyone holds (`calendar-read`, `calendar-reserve`, `page-read`) is read as if the calendar named none. A name the site marks read-only or not grantable leaves nobody able to change that calendar's events, `calendar-manage` holders included. A calendar whose `visibility` is `private` is read only by holders of `calendar-manage`, so the holders of its own manage permission cannot see it unless they also hold `calendar-manage`; set its `visibility` to `authenticated` if they should. The calendar admin page also asks `calendar-manage`, because it shows reservation details. An edit that moves an event to another calendar needs the permission of both calendars. The setting is read on each request, so a change applies with no restart.

### Who may see a calendar

Each calendar's `visibility` setting (see [configuration](docs/configuration.md)) applies to the calendar view, the API (`/api/calendar/events`, `/events/search`, `/events/:id`) and the `.ics` feed alike. A `public` calendar is shown to everyone. Every calendar must have a `visibility`: a configured one with no setting is read as `private`, and the calendar admin page names it. A calendar the configuration does not name is read as `private`, and one set to `enabled: false` is shown to no one. An `authenticated` calendar is shown to holders of the `calendar-read` permission, which this add-on grants to every signed-in account. A `private` calendar is shown to holders of `calendar-manage`. A calendar the viewer may not see shows no events, including in the marquee text, and its single-event and `.ics` addresses answer as not found. A changed `visibility` or `enabled` setting applies on the next request, with no restart.

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
