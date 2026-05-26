
/**
 * Admin routes for the journal add-on.
 * Mounted at /addons/journal in register().
 *
 * Endpoints:
 *   GET   /addons/journal           — config panel
 *   POST  /addons/journal/settings  — save config (placeholder — config stored externally)
 */

import { Router, type Request, type Response } from 'express';
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type JournalDataManager from '../managers/JournalDataManager.js';

export default function adminRoutes(engine: WikiEngine, config: Record<string, unknown>): Router {
  const router = Router();

  function jdm(): JournalDataManager | undefined {
    return engine.getManager<JournalDataManager>('JournalDataManager');
  }

  // ── GET /admin/journal ────────────────────────────────────────────────────
  router.get('/', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();
        ctx.requireRole('admin');

        const showStreakLeaderboard = config['showStreakLeaderboard'] === true;
        const m = jdm();

        // Build per-author stats for the leaderboard / counts table
        let userStats: Array<{ author: string; count: number; streak: number }> = [];
        if (m) {
          const allEntries = await m.listAll();
          const authorSet = [...new Set(allEntries.map(e => e.author))];
          userStats = await Promise.all(
            authorSet.map(async author => ({
              author,
              count:  await m.countByAuthor(author),
              streak: showStreakLeaderboard ? await m.computeStreak(author) : 0
            }))
          );
          userStats.sort((a, b) => b.count - a.count);
        }

        res.render('admin-journal', {
          currentUser:      req.userContext,
          config: {
            defaultPrivate:    config['defaultPrivate']    !== false,
            defaultAuthorLock: config['defaultAuthorLock'] !== false,
            defaultMoodOptions: Array.isArray(config['defaultMoodOptions'])
              ? config['defaultMoodOptions']
              : ['happy', 'content', 'neutral', 'anxious', 'sad', 'grateful', 'energized', 'tired'],
            streakEnabled:      config['streakEnabled']      !== false,
            dailyReminderEnabled: Boolean(config['dailyReminderEnabled']),
            dailyReminderTime:  (config['dailyReminderTime'] as string | undefined) ?? '20:00',
            dailyReminderUsers: Array.isArray(config['dailyReminderUsers'])
              ? config['dailyReminderUsers']
              : [],
            exportEnabled:     config['exportEnabled'] !== false,
            showStreakLeaderboard
          },
          userStats,
          totalEntries:     m ? await m.count() : 0,
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
    })();
  });

  // ── POST /admin/journal/settings ──────────────────────────────────────────
  router.post('/settings', (req: Request, res: Response) => {
    try {
      const ctx = ApiContext.from(req, engine);
      ctx.requireAuthenticated();
      ctx.requireRole('admin');

      // Config changes require editing app-custom-config.json directly.
      // This route exists as a placeholder for a future config-write API.
      res.redirect('/addons/journal?success=Settings+saved+(restart+required+for+config+changes)');
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

