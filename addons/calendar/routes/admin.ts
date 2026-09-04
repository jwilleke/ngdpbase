
import { Router, type Request, type Response } from 'express';
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type CalendarDataManager from '../managers/CalendarDataManager.js';
import type { CalendarConfig } from '../managers/CalendarConfig.js';

/**
 * Admin routes for the calendar add-on.
 * Mounted at /addons/calendar in register().
 *
 * Endpoints:
 *   GET  /addons/calendar      — calendar management dashboard
 */
export default function adminRoutes(
  engine: WikiEngine,
  config: Record<string, unknown>
): Router {
  const router = Router();

  function mgr(): CalendarDataManager | undefined {
    return engine.getManager<CalendarDataManager>('CalendarDataManager');
  }

  /** Read calendars config map. */
  function calendarsConfig(): Record<string, CalendarConfig> {
    const raw = config['calendars'];
    if (!raw || typeof raw !== 'object') return {};
    return raw as Record<string, CalendarConfig>;
  }

  // ── GET /addons/calendar ─────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response) => {
    try {
      const ctx = ApiContext.from(req, engine);
      ctx.requireAuthenticated();
      await ctx.requirePermission('calendar-manage'); // #1198/#1220: policy, not a role name

      const m = mgr();
      const cfgs = calendarsConfig();

      // Build per-calendar sections
      const calendarSections = Object.entries(cfgs)
        .filter(([, cfg]) => cfg.enabled !== false)
        .map(([calendarId, cfg]) => {
          const events = m ? m.query({ calendarId }) : [];
          return {
            calendarId,
            workflow:   cfg.workflow,
            visibility: cfg.visibility,
            eventCount: events.length,
            events
          };
        });

      res.render('admin-calendar', {
        currentUser:      req.userContext,
        calendarSections,
        csrfToken:        req.session?.csrfToken,
        successMessage:   req.query['success'] ?? null,
        errorMessage:     req.query['error']   ?? null
      });
    } catch (err) {
      if (err instanceof ApiError) {
        res.status(err.status).send(err.message);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).send(msg);
    }
  });

  return router;
}

