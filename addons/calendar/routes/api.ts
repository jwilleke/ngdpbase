
import { Router, type Request, type Response } from 'express';
import { generateIcsCalendar } from 'ts-ics';
import type { IcsEvent } from 'ts-ics';
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
import type { CalendarViewer } from '../managers/CalendarDataManager.js';

/**
 * Who is looking, as the manager needs to know it (#1198/#1220): identity for
 * "is this the requester", and whether policy grants calendar-manage. The
 * policy question is asked here, at the door, once per request; the manager
 * never reads a role name.
 */
async function viewerOf(ctx: ApiContext): Promise<CalendarViewer> {
  return {
    username: ctx.username ?? undefined,
    isAuthenticated: ctx.isAuthenticated,
    canManage: await ctx.hasPermission('calendar-manage')
  };
}
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type CalendarDataManager from '../managers/CalendarDataManager.js';
import type { CalendarEvent } from '../managers/CalendarDataManager.js';

/**
 * API routes for the calendar add-on.
 * Mounted at /api/calendar in register().
 *
 * Endpoints:
 *   GET    /api/calendar/events                  — list / FullCalendar feed
 *   POST   /api/calendar/events                  — create event (admin/clubhouse-manager)
 *   GET    /api/calendar/events/search            — keyword search
 *   GET    /api/calendar/events/:id               — get single event
 *   PUT    /api/calendar/events/:id               — update event (admin/clubhouse-manager)
 *   DELETE /api/calendar/events/:id               — delete event (admin/clubhouse-manager)
 *   GET    /api/calendar/:calendarId/feed.ics     — RFC 5545 .ics feed
 */
export default function apiRoutes(engine: WikiEngine, _config: Record<string, unknown>): Router {
  const router = Router();

  function mgr(): CalendarDataManager | undefined {
    return engine.getManager<CalendarDataManager>('CalendarDataManager');
  }

  /** Safely extract a scalar string from req.query — discards arrays/objects. */
  function qs(v: unknown): string | undefined {
    return typeof v === 'string' ? v : undefined;
  }

  /** Centralised ApiError handler — keeps route handlers DRY. */
  function handleError(err: unknown, res: Response): void {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('not found') ? 404
      : msg.includes('Forbidden') ? 403
        : 400;
    res.status(status).json({ error: msg });
  }

  // ── GET /api/calendar/events ─────────────────────────────────────────────
  router.get('/events', async (req: Request, res: Response) => {
    try {
      const m = mgr();
      if (!m) { res.status(503).json({ error: 'CalendarDataManager not available' }); return; }
      const ctx = ApiContext.from(req, engine);
      const viewer = await viewerOf(ctx);
      const events = m.query({
        start:      qs(req.query['start']),
        end:        qs(req.query['end']),
        calendarId: qs(req.query['calendarId'])
      });
      res.json(events.map(e => m.toFullCalendar(e, viewer)));
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── GET /api/calendar/events/search?q= ───────────────────────────────────
  router.get('/events/search', async (req: Request, res: Response) => {
    try {
      const m = mgr();
      const ctx = ApiContext.from(req, engine);
      const viewer = await viewerOf(ctx);
      const q = qs(req.query['q']) ?? '';
      const results = m ? m.search(q).map(e => m.toFullCalendar(e, viewer)) : [];
      res.json({ results });
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── POST /api/calendar/events ────────────────────────────────────────────
  router.post('/events', async (req: Request, res: Response) => {
    try {
      const m = mgr();
      if (!m) { res.status(503).json({ error: 'CalendarDataManager not available' }); return; }
      const ctx = ApiContext.from(req, engine);
      const viewer = await viewerOf(ctx);
      ctx.requireAuthenticated();
      await ctx.requirePermission('calendar-manage'); // #1198/#1220: policy, not a role name
      const event = await m.create(req.body as Parameters<typeof m.create>[0]);
      res.status(201).json(m.toFullCalendar(event, viewer));
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── GET /api/calendar/events/:id ─────────────────────────────────────────
  router.get('/events/:id', async (req: Request, res: Response) => {
    try {
      const m = mgr();
      if (!m) { res.status(503).json({ error: 'CalendarDataManager not available' }); return; }
      const ctx = ApiContext.from(req, engine);
      const viewer = await viewerOf(ctx);
      const event = m.getById(String(req.params['id']));
      if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
      res.json(m.toFullCalendar(event, viewer));
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── PUT /api/calendar/events/:id ─────────────────────────────────────────
  router.put('/events/:id', async (req: Request, res: Response) => {
    try {
      const m = mgr();
      if (!m) { res.status(503).json({ error: 'CalendarDataManager not available' }); return; }
      const ctx = ApiContext.from(req, engine);
      const viewer = await viewerOf(ctx);
      ctx.requireAuthenticated();
      await ctx.requirePermission('calendar-manage'); // #1198/#1220: policy, not a role name
      const event = await m.update(String(req.params['id']), req.body as Parameters<typeof m.update>[1]);
      res.json(m.toFullCalendar(event, viewer));
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── DELETE /api/calendar/events/:id ──────────────────────────────────────
  router.delete('/events/:id', async (req: Request, res: Response) => {
    try {
      const m = mgr();
      if (!m) { res.status(503).json({ error: 'CalendarDataManager not available' }); return; }
      const ctx = ApiContext.from(req, engine);
      ctx.requireAuthenticated();
      await ctx.requirePermission('calendar-manage'); // #1198/#1220: policy, not a role name
      await m.delete(String(req.params['id']));
      res.status(204).end();
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── GET /api/calendar/:calendarId/feed.ics ────────────────────────────────
  //
  // RFC 5545 iCalendar feed. Subscribable from Apple Calendar, Google Calendar, etc.
  // PUBLIC events only — CONFIDENTIAL events are never exported.
  router.get('/:calendarId/feed.ics', async (req: Request, res: Response) => {
    try {
      const m = mgr();
      if (!m) { res.status(503).json({ error: 'CalendarDataManager not available' }); return; }

      const calendarId = String(req.params['calendarId']);
      const events = m.query({ calendarId })
        .filter(e => e.class !== 'CONFIDENTIAL');

      const icsEvents: IcsEvent[] = events.map(e => toIcsEvent(e));

      const feed = generateIcsCalendar({
        prodId: '-//ngdpbase//Calendar//EN',
        version: '2.0',
        events: icsEvents
      });

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${calendarId}.ics"`);
      res.send(feed);
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}

/**
 * Translate a CalendarEvent to a ts-ics IcsEvent object.
 * Used by the feed.ics endpoint.
 *
 * RFC 5545 requires either DTEND or DURATION. We always supply DTEND:
 * for events without an explicit end, fall back to start + 1 hour.
 */
function toIcsEvent(e: CalendarEvent): IcsEvent {
  const now = new Date();
  const startDate = new Date(e.start);
  // RFC 5545 DTEND is required (or DURATION) — default to start + 1 hour
  const endDate = e.end
    ? new Date(e.end)
    : new Date(startDate.getTime() + 60 * 60 * 1000);

  const event: IcsEvent = {
    uid:   e.id,
    summary: e.title,
    stamp: { date: e.dtstamp ? new Date(e.dtstamp) : now },
    start: { date: startDate },
    end:   { date: endDate }
  };

  if (e.description)  event.description  = e.description;
  if (e.location)     event.location     = e.location;
  if (e.url)          event.url          = e.url;
  if (e.created)      event.created      = { date: new Date(e.created) };
  if (e.updated)      event.lastModified = { date: new Date(e.updated) };

  // RFC 5545 CLASS
  if (e.class === 'PUBLIC' || e.class === 'PRIVATE' || e.class === 'CONFIDENTIAL') {
    event.class = e.class;
  }

  // RFC 5545 STATUS
  if (e.status === 'CONFIRMED' || e.status === 'TENTATIVE' || e.status === 'CANCELLED') {
    event.status = e.status;
  }

  // RFC 5545 TRANSP
  if (e.transp === 'OPAQUE' || e.transp === 'TRANSPARENT') {
    event.timeTransparent = e.transp;
  }

  // RFC 5545 ORGANIZER — ts-ics IcsOrganizer requires email
  if (e.organizer) {
    // If organizer looks like an email use it; otherwise treat as display name
    const isEmail = e.organizer.includes('@');
    event.organizer = isEmail
      ? { email: e.organizer }
      : { email: 'noreply@calendar', name: e.organizer };
  }

  return event;
}

