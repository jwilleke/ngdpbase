---
name: "CalendarPlugin"
description: "Event calendar widget powered by FullCalendar — requires the calendar add-on"
dateModified: "2026-04-05"
category: "plugins"
code: addons/calendar/plugins/CalendarPlugin.js
relatedModules: ["AddonsManager", "CalendarDataManager"]
version: "1.0.0"
addon: "calendar"
---

# CalendarPlugin

Embeds a fully interactive event calendar into any wiki page.  Powered by
[FullCalendar v6](https://fullcalendar.io/) (MIT licence) loaded from CDN — no
build step or extra dependencies required on the wiki side.

> __Requires the `calendar` add-on to be enabled.__  
> See the [calendar add-on README](../../addons/calendar/README.md) for installation.

__Source:__ `addons/calendar/plugins/CalendarPlugin.js`

## Plugin Metadata

| Property | Value |
| --- | --- |
| Name | Calendar |
| Add-on | calendar |
| Version | 1.0.0 |
| JSPWiki Compatible | No (new plugin) |

## Usage

### Minimal

```wiki
[{Calendar}]
```

Renders a month-grid calendar that fetches all events from the instance.

### Specify a View

```wiki
[{Calendar view='timeGridWeek'}]
```

### Filter to a Named Calendar

```wiki
[{Calendar calendarId='project-x'}]
```

### Full Example

```wiki
[{Calendar view='timeGridWeek'
            calendarId='team-schedule'
            height='500'
            editable='false'
            firstDay='1'}]
```

## Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `view` | string | `dayGridMonth` | Initial calendar view. See [Views](#views) below. |
| `calendarId` | string | *(all)* | Filter events to this logical calendar. Omit to show all events. |
| `height` | number | `650` | Calendar height in pixels. |
| `editable` | boolean | `true` | Allow drag-and-drop rescheduling and resize. Set `'false'` for read-only display. |
| `weekNumbers` | boolean | `false` | Show ISO week numbers in the left gutter. |
| `firstDay` | number | `0` | First day of the week: `0` = Sunday, `1` = Monday. |

## Views

| Value | Description |
| --- | --- |
| `dayGridMonth` | Month grid (default) |
| `timeGridWeek` | Week with time slots |
| `timeGridDay` | Single day with time slots |
| `listWeek` | Agenda-style list for the current week |

The view switcher toolbar is always visible — users can switch views interactively.

## Events

Events are stored and managed via the calendar add-on's REST API.

### Creating Events (API)

```sh
curl -X POST http://localhost:3000/api/calendar/events \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Team standup",
    "start": "2026-04-07T09:00:00",
    "end":   "2026-04-07T09:30:00",
    "calendarId": "team-schedule"
  }'
```

### Event Fields

| Field | Required | Description |
| --- | --- | --- |
| `title` | Yes | Display label on the calendar |
| `start` | Yes | ISO 8601 start date or datetime |
| `end` | No | ISO 8601 end date or datetime |
| `allDay` | No | `true` for all-day events (no time slot) |
| `description` | No | Tooltip / detail text |
| `url` | No | Wiki page link — clicking the event navigates here |
| `calendarId` | No | Logical calendar name (default: `default`) |
| `color` | No | CSS colour override for this event's pill |

### Linking Events to Wiki Pages

Set `url` to a wiki page path to make an event clickable:

```sh
curl -X POST http://localhost:3000/api/calendar/events \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Sprint Review",
    "start": "2026-04-10T14:00:00",
    "url": "/wiki/SprintReview-2026-04-10"
  }'
```

Clicking the event in the calendar navigates to that wiki page.

## Multiple Calendars on One Page

Each `[{Calendar}]` directive creates an independent widget with its own
FullCalendar instance.  Use `calendarId` to show different event sets:

```wiki
## Team Schedule
[{Calendar calendarId='team-schedule' view='timeGridWeek'}]

## Facilities Bookings
[{Calendar calendarId='facilities' view='dayGridMonth' editable='false'}]
```

## REST API Reference

All endpoints are under `/api/calendar`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/calendar/events` | List/feed — accepts `?start=&end=&calendarId=` |
| `POST` | `/api/calendar/events` | Create event |
| `GET` | `/api/calendar/events/search?q=` | Keyword search |
| `GET` | `/api/calendar/events/:id` | Get single event |
| `PUT` | `/api/calendar/events/:id` | Update event (partial) |
| `DELETE` | `/api/calendar/events/:id` | Delete event |

## Configuration

Enable the add-on in `$FAST_STORAGE/config/app-custom-config.json`:

```json
{
  "ngdpbase.addons.calendar.enabled": true,
  "ngdpbase.addons.calendar.dataPath": "./data/calendar"
}
```

Then install dependencies and restart:

```sh
cd addons/calendar && npm install
./server.sh restart
```

## Error Handling

| Condition | Output |
| --- | --- |
| `calendar` add-on not enabled | `<span class="plugin-error">Calendar: CalendarDataManager not available</span>` |
| API fetch failure | Error message appended inside the calendar container |

## Related Documentation

- [calendar add-on README](../../addons/calendar/README.md) — installation and full API reference
- [Add-on Development Guide](../platform/addon-development-guide.md) — building your own add-ons
- [FullCalendar documentation](https://fullcalendar.io/docs) — upstream UI library

## Version History

| Version | Date | Changes |
| --- | --- | --- |
| 1.0.0 | 2026-04-05 | Initial implementation |
