
/**
 * API routes for the journal add-on.
 * Mounted at /api/journal in register().
 *
 * Endpoints:
 *   GET  /api/journal/new               — bootstrap a new entry page + redirect to /journal/:slug/edit
 *   GET  /api/journal/entries           — JSON list of own entries (paginated)
 *   GET  /api/journal/on-this-day       — JSON: same MM-DD entries from prior years
 *   GET  /api/journal/streak            — JSON: { streak: N, total: N }
 *   GET  /api/journal/export/json       — download all own entries as JSON
 *   GET  /api/journal/export/markdown   — download all own entries as Markdown archive
 */

import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
import WikiContext from '../../../dist/src/context/WikiContext.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type PageManager from '../../../dist/src/managers/PageManager.js';
import type UserManager from '../../../dist/src/managers/UserManager.js';
import type JournalDataManager from '../managers/JournalDataManager.js';
import type { JournalIndexEntry } from '../managers/JournalDataManager.js';

export default function apiRoutes(engine: WikiEngine, config: Record<string, unknown>): Router {
  const router = Router();

  function pm(): PageManager | undefined {
    return engine.getManager<PageManager>('PageManager');
  }

  function jdm(): JournalDataManager | undefined {
    return engine.getManager<JournalDataManager>('JournalDataManager');
  }

  function um(): UserManager | undefined {
    return engine.getManager<UserManager>('UserManager');
  }

  function qs(v: unknown): string | undefined {
    return typeof v === 'string' ? v : undefined;
  }

  async function resolveUserContext(req: Request): Promise<import('../../../dist/src/context/WikiContext.js').UserContext> {
    const userMgr = um();
    const uc = req.userContext || (userMgr ? await userMgr.getCurrentUser(req) : null);
    return uc as import('../../../dist/src/context/WikiContext.js').UserContext;
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
        const slug = `journal-${username}-${date}`;

        const p = pm();
        if (!p) { res.status(503).json({ error: 'PageManager not available' }); return; }

        // Redirect to existing entry if one already exists for this date
        const existing = await p.getPageBySlug(slug);
        if (existing) {
          res.redirect(`/journal/${encodeURIComponent(slug)}/edit`);
          return;
        }

        // #802 — Default Journal Visibility:
        //   1. user pref `journal.defaultPrivate` (if set, wins)
        //   2. deployment-wide `config.defaultPrivate` (fleet fallback)
        //   3. true (privacy-first hard default)
        const userManager = um();
        const freshUser = userManager ? await userManager.getUser(username) : null;
        const userPref = (freshUser?.preferences as Record<string, unknown> | undefined)?.['journal.defaultPrivate'];
        const fleetDefaultPrivate = config['defaultPrivate'] !== false;
        const defaultPrivate = userPref !== undefined ? userPref !== false : fleetDefaultPrivate;
        const defaultAuthorLock = config['defaultAuthorLock'] !== false;
        const uuid = uuidv4();
        // #789: include username so two users journaling on the same day don't
        // collide on the PageManager title-uniqueness check. Slug is already
        // per-user (`journal-${username}-${date}`); title now mirrors that.
        const title = `Journal — ${username} — ${date}`;
        const now = new Date().toISOString();

        const metadata: Record<string, unknown> = {
          title,
          uuid,
          slug,
          'system-category': 'journal',
          'journal-date':    date,
          author:            username,
          lastModified:      now,
          ...(defaultAuthorLock ? { 'author-lock': true } : {}),
          // #802 — canonical semantic flag (replaces legacy `system-location: 'private'`)
          ...(defaultPrivate ? { private: true } : {})
        };

        const wikiContext = new WikiContext(engine, {
          context:     WikiContext.CONTEXT.EDIT,
          pageName:    slug,
          content:     ' ',
          userContext: await resolveUserContext(req)
        });

        // WikiContext imported in addon and the one PageManager was compiled against are structurally
        // identical but treated as different module instances by TypeScript's type checker.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        await p.savePageWithContext(wikiContext as any, metadata);

        // Index in sidecar
        const indexEntry: JournalIndexEntry = {
          uuid,
          slug,
          title,
          author: username,
          journalDate: date,
          mood: undefined,
          tags: [],
          isPrivate: defaultPrivate,
          lastModified: now
        };
        await jdm()?.indexEntry(indexEntry);

        res.redirect(`/journal/${encodeURIComponent(slug)}/edit`);
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
        const total   = m ? await m.countByAuthor(ctx.username!) : 0;
        const entries = m ? await m.listByAuthor(ctx.username!, { limit, offset }) : [];

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
        const entries = m ? await m.getOnThisDay(ctx.username!) : [];

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
        const streak = m ? await m.computeStreak(ctx.username!) : 0;
        const total  = m ? await m.countByAuthor(ctx.username!) : 0;

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
        const entries = m ? await m.listByAuthor(ctx.username!) : [];
        const p = pm();

        const exportData = await Promise.all(entries.map(async (e) => {
          const page = p ? await p.getPage(e.slug) : null;
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
        const entries = m ? await m.listByAuthor(ctx.username!) : [];
        const p = pm();

        const sections: string[] = [`# Journal — ${ctx.username!}\n`];

        for (const e of entries) {
          const page = p ? await p.getPage(e.slug) : null;
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

