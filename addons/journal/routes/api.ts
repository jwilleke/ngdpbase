
/**
 * API routes for the journal add-on.
 * Mounted at /api/journal in register().
 *
 * Endpoints:
 *   GET  /api/journal/new               — the date's entry (created if new), redirect to its editor
 *   GET  /api/journal/entries           — JSON list of own entries (paginated)
 *   GET  /api/journal/on-this-day       — JSON: same MM-DD entries from prior years
 *   GET  /api/journal/streak            — JSON: { streak: N, total: N }
 *   GET  /api/journal/export/json       — download all own entries as JSON
 *   GET  /api/journal/export/markdown   — download all own entries as Markdown archive
 */

import { Router, type Request, type Response } from 'express';
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type PageManager from '../../../dist/src/managers/PageManager.js';
import type JournalDataManager from '../managers/JournalDataManager.js';
import { pageUrl } from '../../../dist/src/utils/pageUrl.js';
import { findJournalEntryName, createJournalEntry } from './helpers.js';

export default function apiRoutes(engine: WikiEngine, config: Record<string, unknown>): Router {
  const router = Router();

  function pm(): PageManager | undefined {
    return engine.getManager<PageManager>('PageManager');
  }

  function jdm(): JournalDataManager | undefined {
    return engine.getManager<JournalDataManager>('JournalDataManager');
  }

  function qs(v: unknown): string | undefined {
    return typeof v === 'string' ? v : undefined;
  }

  function handleError(err: unknown, res: Response): void {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }

  // ── GET /api/journal/new ───────────────────────────────────────────────────
  router.get('/new', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();

        const username = ctx.username!;
        const date = qs(req.query['date']) ?? new Date().toISOString().slice(0, 10);

        // The entry for the date if there is one, else a new one — then its editor.
        const name = await findJournalEntryName(engine, date, username, req.userContext)
          ?? await createJournalEntry(engine, config, req.userContext, date);
        res.redirect(pageUrl(name, 'edit'));
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  // ── GET /api/journal/entries ───────────────────────────────────────────────
  router.get('/entries', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();

        const limit  = parseInt(qs(req.query['limit'])  ?? '50', 10) || 50;
        const offset = parseInt(qs(req.query['offset']) ?? '0',  10) || 0;

        const m       = jdm();
        const total   = m ? await m.countByAuthor(ctx.username!, req.userContext) : 0;
        const entries = m ? await m.listByAuthor(ctx.username!, req.userContext, { limit, offset }) : [];

        res.json({ entries, total, offset, limit });
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  // ── GET /api/journal/on-this-day ──────────────────────────────────────────
  router.get('/on-this-day', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();

        const today   = new Date().toISOString().slice(0, 10);
        const m       = jdm();
        const entries = m ? await m.getOnThisDay(ctx.username!, req.userContext) : [];

        res.json({ entries, today });
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  // ── GET /api/journal/streak ───────────────────────────────────────────────
  router.get('/streak', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();

        const m      = jdm();
        const streak = m ? await m.computeStreak(ctx.username!, req.userContext) : 0;
        const total  = m ? await m.countByAuthor(ctx.username!, req.userContext) : 0;

        res.json({ streak, total });
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  // ── GET /api/journal/export/json ──────────────────────────────────────────
  router.get('/export/json', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();

        if (config['exportEnabled'] === false) {
          res.status(403).json({ error: 'Export is disabled.' });
          return;
        }

        const m = jdm();
        const entries = m ? await m.listByAuthor(ctx.username!, req.userContext) : [];
        const p = pm();

        const exportData = await Promise.all(entries.map(async (e) => {
          const page = p ? await p.getPage(e.name, req.userContext) : null;
          return {
            slug:         e.slug,
            title:        e.title,
            journalDate:  e.journalDate,
            mood:         e.mood ?? null,
            tags:         e.tags,
            isPrivate:    e.isPrivate,
            lastModified: e.lastModified,
            content:      page?.content ?? ''
          };
        }));

        const filename = `journal-${ctx.username!}-${new Date().toISOString().slice(0, 10)}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(JSON.stringify(exportData, null, 2));
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  // ── GET /api/journal/export/markdown ──────────────────────────────────────
  router.get('/export/markdown', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();

        if (config['exportEnabled'] === false) {
          res.status(403).send('Export is disabled.');
          return;
        }

        const m = jdm();
        const entries = m ? await m.listByAuthor(ctx.username!, req.userContext) : [];
        const p = pm();

        const sections: string[] = [`# Journal — ${ctx.username!}\n`];

        for (const e of entries) {
          const page = p ? await p.getPage(e.name, req.userContext) : null;
          const meta: string[] = [`Date: ${e.journalDate}`];
          if (e.mood)        meta.push(`Mood: ${e.mood}`);
          if (e.tags.length) meta.push(`Tags: ${e.tags.join(', ')}`);
          sections.push(
            `## ${e.title}\n\n` +
            meta.map(l => `_${l}_`).join('  \n') +
            '\n\n' +
            (page?.content ?? '') +
            '\n\n---\n'
          );
        }

        const filename = `journal-${ctx.username!}-${new Date().toISOString().slice(0, 10)}.md`;
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(sections.join('\n'));
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  return router;
}

