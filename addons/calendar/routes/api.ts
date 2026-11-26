
import type { Router, Request, Response } from 'express';
import { generateIcsCalendar } from 'ts-ics';
import type { IcsEvent } from 'ts-ics';
import type { ApiContext } from '../../../dist/src/context/ApiContext.js';
import type { AddonHost } from '../../../dist/src/utils/addonHost.js';
import type { CalendarViewer } from '../managers/CalendarDataManager.js';
import { MANAGE_PERMISSION, calendarGate, currentCalendarConfig } from '../managers/calendarVisibility.js';
import { declaredPermissionNames, resolveManagePermission } from '../managers/calendarManage.js';
import { isSafeEventUrl } from '../managers/eventUrl.js';
import { hasControlCharacter, icsBlockText, icsLineText } from '../managers/eventText.js';
import type { CalendarGate } from '../managers/calendarVisibility.js';
import type IdentityManager from '../../../dist/src/managers/IdentityManager.js';

/**
 * Who is looking, as the manager needs to know it (#1198/#1220): identity for
 * "is this the requester" (the identity @id, #2041, and the username for a
 * reservation not yet converted), and whether policy grants calendar-manage.
 * The policy question is asked here, at the door, once per request; the
 * manager never reads a role name.
 */
export async function viewerOf(ctx: ApiContext, engine: WikiEngine, host: AddonHost): Promise<CalendarViewer> {
  const identityId = ctx.isAuthenticated && ctx.username
    ? await engine.getManager<IdentityManager>('IdentityManager')
      ?.identityIdOf(host.systemContext('calendar: the viewer identity @id (#2041)'), ctx.username)
    : null;
  return {
    username: ctx.username ?? undefined,
    identityId: identityId ?? undefined,
    isAuthenticated: ctx.isAuthenticated,
    canManage: await ctx.hasPermission('calendar-manage')
  };
}
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type CalendarDataManager from '../managers/CalendarDataManager.js';
import type { CalendarEvent } from '../managers/CalendarDataManager.js';

/** The events of the calendars the request may see. */
async function onlyVisible(events: CalendarEvent[], may: CalendarGate): Promise<CalendarEvent[]> {
  const kept: CalendarEvent[] = [];
  for (const e of events) if (await may(e.calendarId)) kept.push(e);
  return kept;
}

/**
 * API routes for the calendar add-on.
 * Mounted at /api/calendar in register().
 *
 * The read routes (list, search, single event, .ics feed) honour each calendar's
 * `visibility` setting: public, authenticated or private. A calendar the
 * configuration does not name is read as private, and one set to
 * `enabled: false` is left out.
 *
 * The write routes (create, edit, delete) ask policy for the permission the
 * event's calendar names in its `manage-permission` setting, `calendar-manage`
 * when it names none. A name the site has not declared is refused for everyone.
 * An edit that changes `calendarId` is checked against both calendars. A
 * reservation calendar, and any event that carries (or is given) a `_private`
 * block, always asks `calendar-manage`. An event's `url` must be empty, relative,
 * or start with `http:`, `https:` or `mailto:` (400 otherwise; a relative address with
 * a colon before its first slash, `Page:Name`, reads as a scheme and is written
 * `./Page:Name`), and one stored before that rule is left out of what is returned.
 * An `organizer` is text without a control character, and `start` and `end` are
 * dates (400 otherwise). The .ics feed drops control characters from every text it
 * writes and leaves out an event whose dates it cannot read.
 *
 * Endpoints:
 *   GET    /api/calendar/events                  — list / FullCalendar feed
 *   POST   /api/calendar/events                  - create event (the calendar's manage permission)
 *   GET    /api/calendar/events/search            — keyword search
 *   GET    /api/calendar/events/:id               — get single event
 *   PUT    /api/calendar/events/:id               - update event (the calendar's manage permission)
 *   DELETE /api/calendar/events/:id               - delete event (the calendar's manage permission)
 *   GET    /api/calendar/:calendarId/feed.ics     — RFC 5545 .ics feed
 */
export default function apiRoutes(engine: WikiEngine, config: Record<string, unknown>, host: AddonHost): Router {
  const { ApiContext, ApiError, sendApiError } = host;
  const router = engine.createRouter();

  function mgr(): CalendarDataManager | undefined {
    return engine.getManager<CalendarDataManager>('CalendarDataManager');
  }

  /**
   * The gate for this request: the add-on's configuration as it is now, so a
   * changed `visibility` or `enabled` applies on the next request.
   */
  function gateFor(ctx: ApiContext): CalendarGate {
    return calendarGate(p => ctx.hasPermission(p), currentCalendarConfig(engine, config));
  }

  /**
   * Refuse unless the request holds the permission `calendarId` names for managing
   * its events, read from the configuration as it is now. The permission is asked
   * through `requirePermission`, so the refusal and the step-up rule are the usual
   * ones. A calendar whose permission nobody can hold is refused the same way.
   */
  async function requireManage(ctx: ApiContext, calendarId: string): Promise<void> {
    const permission = resolveManagePermission(currentCalendarConfig(engine, config), calendarId, declaredPermissionNames(engine));
    if (permission === null) throw new ApiError(ctx.isAuthenticated ? 403 : 401, 'Forbidden');
    await ctx.requirePermission(permission); // #2546: the calendar's own permission, policy not a role name
  }

  /**
   * Private reservation details (the `_private` block) are not governed by a
   * calendar's own manage permission: writing one, or changing or deleting an
   * event that carries one, also needs `calendar-manage`, so a calendar's own
   * manager cannot forge a requester or rewrite someone's reservation.
   */
  async function requirePrivateBlock(ctx: ApiContext, existing: CalendarEvent | undefined, body: unknown): Promise<void> {
    const writes = !!body && typeof body === 'object' && Object.hasOwn(body, '_private');
    if (writes || existing?._private !== undefined) await ctx.requirePermission(MANAGE_PERMISSION);
  }

  /**
   * The permission answers above take a moment, and another request may move the event
   * meanwhile. Called right before the change, with no wait between: an event that is
   * now on another calendar than the one that was checked is refused.
   */
  function stillOn(m: CalendarDataManager, id: string, checked: CalendarEvent | undefined): void {
    if (m.getById(id)?.calendarId !== checked?.calendarId) throw new ApiError(409, 'The event changed while it was being checked. Try again.');
  }

  /**
   * The `calendarId` a request body names: undefined when it names none. Throws a
   * 400 for a value that is not text, so a body cannot slip past the check as a
   * number, list or null that the manager would store as it is.
   */
  function bodyCalendarId(body: unknown): string | undefined {
    if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'calendarId')) return undefined;
    const value = (body as Record<string, unknown>)['calendarId'];
    if (typeof value === 'string') return value;
    if (value === undefined) return undefined;
    throw new ApiError(400, 'calendarId must be text');
  }

  /**
   * A body's `url`, when it has one, must be an address the calendar block may open
   * (see `isSafeEventUrl`): a 400 otherwise, so a script address is never stored.
   */
  function checkEventUrl(body: unknown): void {
    if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'url')) return;
    const value = (body as Record<string, unknown>)['url'];
    if (value === undefined) return;
    if (!isSafeEventUrl(value)) throw new ApiError(400, 'url must be empty, a relative address, or start with http:, https: or mailto:');
  }

  /**
   * A body's `organizer`, when it has one, must be text without a control character:
   * it is written into the .ics feed, where a line break would add a line of the
   * writer's choosing.
   */
  function checkOrganizer(body: unknown): void {
    if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'organizer')) return;
    const value = (body as Record<string, unknown>)['organizer'];
    if (value === undefined) return;
    if (typeof value !== 'string') throw new ApiError(400, 'organizer must be text');
    if (hasControlCharacter(value)) throw new ApiError(400, 'organizer must not contain a line break or other control character');
  }

  /**
   * A body's `start` and `end`, when it has them, must be dates the calendar can read.
   * An event with a start that is not a date stops the calendar's .ics feed from being built.
   */
  function checkEventDates(body: unknown): void {
    if (!body || typeof body !== 'object') return;
    for (const field of ['start', 'end']) {
      if (!Object.hasOwn(body, field)) continue;
      const value = (body as Record<string, unknown>)[field];
      if (value === undefined) continue;
      if (typeof value !== 'string' || value.trim() === '' || Number.isNaN(new Date(value).getTime())) {
        throw new ApiError(400, `${field} must be a date, such as 2026-12-01 or 2026-12-01T10:00:00`);
      }
    }
  }

  /**
   * What each answer holds depends on who asks, so a shared cache must not keep it.
   */
  function privateCache(res: Response): void {
    res.setHeader('Cache-Control', 'private');
  }

  /** Safely extract a scalar string from req.query — discards arrays/objects. */
  function qs(v: unknown): string | undefined {
    return typeof v === 'string' ? v : undefined;
  }

  /** Centralised ApiError handler — keeps route handlers DRY. */
  function handleError(err: unknown, res: Response): void {
    if (err instanceof ApiError) {
      sendApiError(res, err);
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
      const viewer = await viewerOf(ctx, engine, host);
      const events = await onlyVisible(m.query({
        start:      qs(req.query['start']),
        end:        qs(req.query['end']),
        calendarId: qs(req.query['calendarId'])
      }), gateFor(ctx));
      privateCache(res);
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
      const viewer = await viewerOf(ctx, engine, host);
      const q = qs(req.query['q']) ?? '';
      const results = m
        ? (await onlyVisible(m.search(q), gateFor(ctx))).map(e => m.toFullCalendar(e, viewer))
        : [];
      privateCache(res);
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
      const viewer = await viewerOf(ctx, engine, host);
      // The calendar the event lands on: the manager files one with none on `default`.
      await requireManage(ctx, bodyCalendarId(req.body) ?? 'default');
      await requirePrivateBlock(ctx, undefined, req.body);
      checkEventUrl(req.body);
      checkOrganizer(req.body);
      checkEventDates(req.body);
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
      const viewer = await viewerOf(ctx, engine, host);
      const event = m.getById(String(req.params['id']));
      privateCache(res);
      if (!event || !(await gateFor(ctx)(event.calendarId))) { res.status(404).json({ error: 'Event not found' }); return; }
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
      const viewer = await viewerOf(ctx, engine, host);
      const id = String(req.params['id']);
      const existing = m.getById(id);
      // An event that is not there is asked about the way it always was.
      await (existing ? requireManage(ctx, existing.calendarId) : ctx.requirePermission(MANAGE_PERMISSION));
      const target = bodyCalendarId(req.body);
      // Moving an event is a change to two calendars: ask the one it goes to as well.
      if (existing && target !== undefined && target !== existing.calendarId) await requireManage(ctx, target);
      await requirePrivateBlock(ctx, existing, req.body);
      checkEventUrl(req.body);
      checkOrganizer(req.body);
      checkEventDates(req.body);
      stillOn(m, id, existing);
      const event = await m.update(id, req.body as Parameters<typeof m.update>[1]);
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
      const id = String(req.params['id']);
      const existing = m.getById(id);
      await (existing ? requireManage(ctx, existing.calendarId) : ctx.requirePermission(MANAGE_PERMISSION));
      await requirePrivateBlock(ctx, existing, undefined);
      stillOn(m, id, existing);
      await m.delete(id);
      res.status(204).end();
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── GET /api/calendar/:calendarId/feed.ics ────────────────────────────────
  //
  // RFC 5545 iCalendar feed. Subscribable from Apple Calendar, Google Calendar, etc.
  // PUBLIC events only — CONFIDENTIAL events are never exported. A calendar the
  // request may not see, under its `visibility`, answers as not found, and so does
  // one the configuration does not name, with the same answer.
  router.get('/:calendarId/feed.ics', async (req: Request, res: Response) => {
    try {
      const m = mgr();
      if (!m) { res.status(503).json({ error: 'CalendarDataManager not available' }); return; }

      const ctx = ApiContext.from(req, engine);
      const calendarId = String(req.params['calendarId']);
      privateCache(res);
      if (!(await gateFor(ctx)(calendarId))) { res.status(404).json({ error: 'Calendar not found' }); return; }
      const events = m.query({ calendarId })
        .filter(e => e.class !== 'CONFIDENTIAL');

      // An event that cannot be written as one (a start that is not a date) is left out, not the whole feed.
      const icsEvents: IcsEvent[] = [];
      for (const e of events) {
        try {
          icsEvents.push(toIcsEvent(e));
        } catch {
          continue;
        }
      }

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

/** A date from stored text, or undefined when it is not one. */
function readDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Translate a CalendarEvent to a ts-ics IcsEvent object.
 * Used by the feed.ics endpoint.
 *
 * RFC 5545 requires either DTEND or DURATION. We always supply DTEND:
 * for events without an explicit end, fall back to start + 1 hour.
 *
 * Throws for an event whose start (or end) is not a date, so the caller can leave
 * it out. Every text field has its control characters dropped (see eventText.ts):
 * a stored line break cannot start a line of the feed.
 */
function toIcsEvent(e: CalendarEvent): IcsEvent {
  const now = new Date();
  const startDate = readDate(e.start);
  if (!startDate) throw new Error(`Event ${e.id} has no readable start`);
  // RFC 5545 DTEND is required (or DURATION) — default to start + 1 hour
  const endDate = e.end
    ? readDate(e.end)
    : new Date(startDate.getTime() + 60 * 60 * 1000);
  if (!endDate) throw new Error(`Event ${e.id} has no readable end`);

  const event: IcsEvent = {
    uid:   icsLineText(String(e.id)),
    summary: icsLineText(String(e.title ?? '')),
    stamp: { date: readDate(e.dtstamp) ?? now },
    start: { date: startDate },
    end:   { date: endDate }
  };

  if (e.description)  event.description  = icsBlockText(String(e.description));
  if (e.location)     event.location     = icsLineText(String(e.location));
  if (e.url && isSafeEventUrl(e.url)) event.url = e.url;
  const created = readDate(e.created);
  if (created)        event.created      = { date: created };
  const updated = readDate(e.updated);
  if (updated)        event.lastModified = { date: updated };

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
  const organizer = typeof e.organizer === 'string' ? icsLineText(e.organizer) : '';
  if (organizer) {
    // If organizer looks like an email use it; otherwise treat as display name
    const isEmail = organizer.includes('@');
    event.organizer = isEmail
      ? { email: organizer }
      : { email: 'noreply@calendar', name: organizer };
  }

  return event;
}
