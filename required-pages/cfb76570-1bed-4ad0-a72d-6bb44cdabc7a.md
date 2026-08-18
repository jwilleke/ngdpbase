---
title: Using CalendarPlugin
uuid: cfb76570-1bed-4ad0-a72d-6bb44cdabc7a
system-category: documentation
user-keywords:
  - Plugins
  - Calendar
  - Events
  - Schedule
slug: using-calendarplugin
lastModified: '2026-04-23T00:00:00.000Z'
author: system
---
# Using CalendarPlugin

The __CalendarPlugin__ embeds an interactive event calendar into any page.

## Description

Use this plugin to display a calendar of events on a page.  Visitors can switch
between month, week, day, and agenda views using the toolbar.  Events can link
to pages for full details. See [Plugins] for a complete list of available plugins.

> __Note:__ This plugin requires the `calendar` add-on to be enabled by your
> administrator before it will work.

## Syntax

[[{Calendar}] renders as a month-grid calendar showing all events:

[{Calendar}]

## Parameters

%%table-striped
|| Parameter || Default || Description ||
| `view` | `dayGridMonth` | Initial view: `dayGridMonth`, `timeGridWeek`, `timeGridDay`, or `listWeek`. |
| `calendarId` | *(all)* | Show only events belonging to this named calendar. Omit to show everything. |
| `height` | `650` | Height of the calendar in pixels. |
| `editable` | `true` | Allow drag-and-drop rescheduling. Use `'false'` for a read-only display. |
| `weekNumbers` | `false` | Show ISO week numbers in the left gutter. |
| `firstDay` | `0` | First day of the week: `0` = Sunday, `1` = Monday. |
/%

## Examples

### Default Month View

[[{Calendar}] renders as:

[{Calendar}]

### Week View

[[{Calendar view='timeGridWeek'}] renders as:

[{Calendar view='timeGridWeek'}]

### Read-Only Agenda for a Specific Calendar

[[{Calendar view='listWeek' calendarId='team-schedule' editable='false'}] renders as:

[{Calendar view='listWeek' calendarId='team-schedule' editable='false'}]

### Compact Month View

[[{Calendar height='400'}] renders as:

[{Calendar height='400'}]

### Week Starting on Monday

[[{Calendar view='timeGridWeek' firstDay='1'}] renders as:

[{Calendar view='timeGridWeek' firstDay='1'}]

### Two Separate Calendars on One Page

[[{Calendar calendarId='facilities' view='dayGridMonth' editable='false'}]

[[{Calendar calendarId='team-schedule' view='timeGridWeek'}]

renders two independent calendars, each showing a different set of events.

## Notes

- The toolbar lets users switch views at any time — the `view` parameter only
  sets the view shown on first load.
- Setting `editable='false'` prevents drag-and-drop but does not restrict who
  can create or delete events via the API.
- If an event has a `url` field set to a page path, clicking the event navigates to that page.
- Multiple `[{Calendar}]` directives on the same page each render independently.
- The calendar loads [FullCalendar](https://fullcalendar.io/) from a CDN — an
  internet connection is required unless your instance mirrors the assets locally.
