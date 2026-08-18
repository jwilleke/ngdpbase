# Calendar Add-on — Developer Documentation

The Calendar add-on provides multi-calendar event management for ngdpbase with
RFC 5545 support, FullCalendar v6 UI, `.ics` subscription feeds, a clubhouse
reservation workflow, and a MarqueePlugin integration for upcoming-events banners.

## Contents

| Document | Purpose |
|----------|---------|
| [configuration.md](./configuration.md) | All config keys, N-calendar setup, environment variables |
| [api-reference.md](./api-reference.md) | Complete REST API — request/response shapes, auth, error codes |
| [data-model.md](./data-model.md) | TypeScript interfaces, storage layout, RFC 5545 field mapping |

## Architecture

```
addons/calendar/
├── index.ts                       ← addon entry point (register, status, shutdown)
├── managers/
│   ├── CalendarDataManager.ts     ← extends BaseManager; all CRUD, conflict detection
│   └── CalendarConfig.ts          ← per-calendar config interface
├── routes/
│   ├── api.ts                     ← GET/POST/PUT/DELETE events + .ics feed
│   ├── reservations.ts            ← POST/DELETE reservations workflow
│   └── admin.ts                   ← GET /admin/calendar management dashboard
├── plugins/
│   └── CalendarPlugin.ts          ← [{Calendar}] wiki markup plugin
├── public/
│   ├── css/calendar.css
│   └── js/calendar-modal.js       ← vanilla JS create/edit/delete modal
├── pages/                         ← wiki pages seeded on first install
└── docs/                          ← this directory
```

## Startup sequence

1. `WikiEngine.initialize()` creates `AddonsManager` but defers addon loading.
2. `app.ts` sets up `express-session` and `userContext` middleware.
3. `app.ts` calls `engine.initializeAddons()` — addon routes are registered
   __after__ session middleware so `ApiContext.from(req, engine)` sees the correct
   authenticated user.

## Key dependencies

| Package | Purpose |
|---------|---------|
| `ts-ics` | RFC 5545 `.ics` generation |
| `date-fns` | Conflict detection (`areIntervalsOverlapping`), date formatting |
| `uuid` | Event UUID generation |
| `express` | Route handlers |

## Adding a new calendar

Add one entry to `ngdpbase.addons.calendar.calendars` in `app-custom-config.json`.
No code changes required. Storage file `data/calendar/<id>.json` is created
automatically on first write.

```json
"ngdpbase.addons.calendar.calendars": {
  "my-new-calendar": {
    "workflow": "managed",
    "visibility": "public",
    "enabled": true
  }
}
```

## Auth model

All routes use `ApiContext.from(req, engine)`. Guards:

| Action | Requirement |
|--------|-------------|
| Read public events | none |
| Read authenticated-visibility events | authenticated |
| Read private-visibility events | `admin` or `clubhouse-manager` |
| Create / update / delete managed events | `admin` or `clubhouse-manager` |
| Submit a reservation | authenticated |
| Cancel own reservation | authenticated (owner) |
| Cancel any reservation | `admin` or `clubhouse-manager` |
| Admin dashboard | `admin` or `clubhouse-manager` |

## Extending

- __New route__: create `routes/my-feature.ts`, export `(engine, config) => Router`,
  mount in `index.ts`.
- __New manager method__: add to `CalendarDataManager.ts`; available engine-wide
  via `engine.getManager('CalendarDataManager')`.
- __New plugin param__: add to `CalendarPlugin.ts` `params` block.
