
import { Router, type Request, type Response } from 'express';
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type CalendarDataManager from '../managers/CalendarDataManager.js';
import type EmailManager from '../../../dist/src/managers/EmailManager.js';
import type { CalendarConfig } from '../managers/CalendarConfig.js';

/**
 * Reservation routes for the calendar add-on.
 * Mounted at /api/calendar in register().
 *
 * Endpoints:
 *   POST   /api/calendar/reservations              — submit a reservation request
 *   DELETE /api/calendar/reservations/:id          — cancel a reservation
 */
export default function reservationRoutes(
  engine: WikiEngine,
  config: Record<string, unknown>
): Router {
  const router = Router();

  function mgr(): CalendarDataManager | undefined {
    return engine.getManager<CalendarDataManager>('CalendarDataManager');
  }

  function emailMgr(): EmailManager | undefined {
    return engine.getManager<EmailManager>('EmailManager');
  }

  /** Read the manager email from config (used for notifications). */
  function managerEmail(): string | undefined {
    const v = config['clubhouse-manager-email'];
    return typeof v === 'string' ? v : undefined;
  }

  /** Return the config entry for a calendar, or undefined if not found. */
  function calendarConfig(calendarId: string): CalendarConfig | undefined {
    const calendars = config['calendars'];
    if (!calendars || typeof calendars !== 'object') return undefined;
    const entry = (calendars as Record<string, unknown>)[calendarId];
    if (!entry || typeof entry !== 'object') return undefined;
    return entry as CalendarConfig;
  }

  // ── POST /api/calendar/reservations ──────────────────────────────────────
  router.post('/reservations', async (req: Request, res: Response) => {
    try {
      const m = mgr();
      if (!m) { res.status(503).json({ error: 'CalendarDataManager not available' }); return; }

      // 1. Authentication required
      const ctx = ApiContext.from(req, engine);
      const viewer = { username: ctx.username ?? undefined, isAuthenticated: ctx.isAuthenticated, canManage: await ctx.hasPermission('calendar-manage') };
      ctx.requireAuthenticated();

      // 2. Validate body
      const body = req.body as Record<string, unknown>;
      const calendarId = typeof body['calendarId'] === 'string' ? body['calendarId'] : undefined;
      const title      = typeof body['title']      === 'string' ? body['title']      : undefined;
      const start      = typeof body['start']      === 'string' ? body['start']      : undefined;
      const end        = typeof body['end']        === 'string' ? body['end']        : undefined;

      if (!calendarId) { res.status(400).json({ error: 'calendarId is required' }); return; }
      if (!title)      { res.status(400).json({ error: 'title is required' });      return; }
      if (!start)      { res.status(400).json({ error: 'start is required' });      return; }
      if (!end)        { res.status(400).json({ error: 'end is required for reservations' }); return; }

      // 3. Calendar must have workflow: reservation
      const calCfg = calendarConfig(calendarId);
      if (!calCfg || calCfg.workflow !== 'reservation') {
        res.status(400).json({ error: `Calendar '${calendarId}' does not accept reservations` });
        return;
      }

      // 4. Conflict check
      const hasConflict = m.checkConflict(calendarId, start, end);
      if (hasConflict) {
        res.status(409).json({ error: 'The requested time slot is already reserved' });
        return;
      }

      // 5. Create event with CLASS: CONFIDENTIAL and private metadata
      const event = await m.create({
        title,
        start,
        end,
        calendarId,
        allDay:      Boolean(body['allDay']),
        description: typeof body['description'] === 'string' ? body['description'] : undefined,
        location:    typeof body['location']    === 'string' ? body['location']    : undefined,
        class:       'CONFIDENTIAL',
        transp:      'OPAQUE',
        status:      'CONFIRMED',
        createdBy:   ctx.username ?? undefined,
        _private: {
          requester:      ctx.username,
          requesterEmail: ctx.email,
          notes:          typeof body['notes'] === 'string' ? body['notes'] : undefined
        }
      });

      // 6. Email notifications (fire-and-forget — do not fail the request if email fails)
      const em = emailMgr();
      if (em) {
        const dateStr = `${start} – ${end}`;
        const subject = `Reservation request: ${title}`;
        const notes = typeof body['notes'] === 'string' && body['notes']
          ? `Notes    : ${body['notes']}`
          : '';
        const text = [
          'A reservation has been submitted.',
          '',
          `Calendar : ${calendarId}`,
          `Event    : ${title}`,
          `When     : ${dateStr}`,
          `Requester: ${ctx.displayName ?? ctx.username ?? 'unknown'}`,
          notes
        ].filter(Boolean).join('\n');

        const requesterEmail = ctx.email;
        const mgrEmail = managerEmail();

        if (requesterEmail) {
          em.sendTo(requesterEmail, subject, text).catch(() => { /* non-critical */ });
        }
        if (mgrEmail) {
          em.sendTo(mgrEmail, `[Manager] ${subject}`, text).catch(() => { /* non-critical */ });
        }
      }

      // 7. Return 201 with the stripped event (requester sees their own _private)
      res.status(201).json(m.toFullCalendar(event, viewer));
    } catch (err) {
      if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // ── DELETE /api/calendar/reservations/:id ─────────────────────────────────
  router.delete('/reservations/:id', async (req: Request, res: Response) => {
    try {
      const m = mgr();
      if (!m) { res.status(503).json({ error: 'CalendarDataManager not available' }); return; }

      const ctx = ApiContext.from(req, engine);
      ctx.requireAuthenticated();

      // #1198/#1220: the manager asks "may this viewer manage?" — answered by
      // policy here, never by a role name inside the manager.
      await m.cancelReservation(String(req.params['id']), {
        isAuthenticated: ctx.isAuthenticated,
        username: ctx.username ?? undefined,
        canManage: await ctx.hasPermission('calendar-manage')
      });

      res.status(204).end();
    } catch (err) {
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
  });

  return router;
}

