
/**
 * Editor routes for the journal add-on.
 * Mounted at /journal in register() (after public routes).
 *
 * Endpoints:
 *   GET  /journal/settings      — user preferences form
 *   POST /journal/settings      — save user preferences
 *   GET  /journal/new           — auto-creates today's stub entry, redirects to /edit/<slug>
 *   GET  /journal/:slug/edit    — redirects to /edit/<slug>
 *   POST /journal/:slug/delete  — delete entry
 *
 * #799 / EPIC #790 retired the parallel POST /journal/new + POST /journal/:slug/edit
 * handlers. Journal pages now save through the unified /save/<slug> pipeline.
 * The journal-specific frontmatter UI (mood, journal-date) is injected into the
 * generic editor via slot HTML — see WikiRoutes.buildEditorExtraFrontmatterFields
 * (#797). Tag tracking is on the page's `user-keywords` field (not the legacy
 * `journal-tags`).
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
import { getLeftMenu } from './helpers.js';

export default function editorRoutes(engine: WikiEngine, config: Record<string, unknown>): Router {
  const router = Router();

  function jdm(): JournalDataManager | undefined {
    return engine.getManager<JournalDataManager>('JournalDataManager');
  }

  function enableVoiceToText(): boolean {
    return config['enableVoiceToText'] !== false;
  }

  function pm(): PageManager | undefined {
    return engine.getManager<PageManager>('PageManager');
  }

  function um(): UserManager | undefined {
    return engine.getManager<UserManager>('UserManager');
  }

  function sp(v: string | string[] | undefined): string {
    return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
  }

  async function resolveUserContext(req: Request): Promise<import('../../../dist/src/context/WikiContext.js').UserContext> {
    const um = engine.getManager<UserManager>('UserManager');
    const uc = req.userContext || (um ? await um.getCurrentUser(req) : null);
    return uc as import('../../../dist/src/context/WikiContext.js').UserContext;
  }

  function handleError(err: unknown, res: Response): void {
    if (err instanceof ApiError) {
      res.status(err.status).send(err.message);
      return;
    }
    res.status(500).send(err instanceof Error ? err.message : String(err));
  }

  // ── GET /journal/settings ────────────────────────────────────────────────────
  router.get('/settings', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();

        const userManager = um();
        const freshUser = userManager ? await userManager.getUser(ctx.username!) : null;
        const prefs = (freshUser?.preferences ?? {}) as Record<string, unknown>;
        const leftMenu = await getLeftMenu(engine, req.userContext ?? null);

        res.render('journal-settings', {
          currentUser:      req.userContext,
          prefs: {
            voiceToText:      prefs['journal.voiceToText']      !== false,
            reminderEnabled:  Boolean(prefs['journal.reminderEnabled']),
            reminderTime:     (prefs['journal.reminderTime'] as string | undefined)     ?? '20:00',
            streakVisible:    prefs['journal.streakVisible']    !== false
          },
          adminVoiceEnabled: enableVoiceToText(),
          csrfToken:         req.session?.csrfToken,
          successMessage:    req.query['success'] ?? null,
          errorMessage:      req.query['error']   ?? null,
          leftMenu
        });
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  // ── POST /journal/settings ───────────────────────────────────────────────────
  router.post('/settings', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();

        const userManager = um();
        if (!userManager) { res.status(503).send('UserManager not available'); return; }

        const freshUser = await userManager.getUser(ctx.username!);
        const existing = (freshUser?.preferences ?? {}) as Record<string, unknown>;

        const body = req.body as Record<string, unknown>;
        const updated: Record<string, unknown> = {
          ...existing,
          'journal.defaultTemplate': typeof body['defaultTemplate'] === 'string'
            ? body['defaultTemplate']
            : 'free-write',
          'journal.voiceToText':    body['voiceToText']    === 'on',
          'journal.reminderEnabled': body['reminderEnabled'] === 'on',
          'journal.reminderTime':   typeof body['reminderTime'] === 'string' && body['reminderTime'].trim()
            ? body['reminderTime'].trim()
            : '20:00',
          'journal.streakVisible':  body['streakVisible']  === 'on'
        };

        await userManager.updateUser(ctx.username!, { preferences: updated });
        res.redirect('/journal/settings?success=Settings+saved');
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  // ── GET /journal/new ─────────────────────────────────────────────────────────
  // Auto-creates a stub journal entry for today (if one doesn't exist) then
  // redirects to the standard /edit/:slug page editor. (#540)
  router.get('/new', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();

        const username = ctx.username!;
        const date = typeof req.query['date'] === 'string'
          ? req.query['date']
          : new Date().toISOString().slice(0, 10);

        const slug = `journal-${username}-${date}`;

        const p = pm();
        if (!p) { res.status(503).send('PageManager not available'); return; }

        // If entry already exists for today, go straight to the standard editor
        const existing = await p.getPageBySlug(slug);
        if (existing) {
          res.redirect(`/edit/${encodeURIComponent(slug)}`);
          return;
        }

        // Create stub entry with journal frontmatter
        const uuid = uuidv4();
        // #789: per-user title to avoid PageManager title-uniqueness collision
        // when two users journal on the same date. Mirrors the per-user slug.
        const title = `Journal — ${username} — ${date}`;
        const defaultPrivate    = config['defaultPrivate']    !== false;
        const defaultAuthorLock = config['defaultAuthorLock'] !== false;

        const metadata: Record<string, unknown> = {
          title,
          uuid,
          slug,
          'system-category': 'journal',
          'journal-date':    date,
          author:            username,
          lastModified:      new Date().toISOString(),
          ...(defaultAuthorLock ? { 'author-lock': true }                                   : {}),
          ...(defaultPrivate    ? { 'system-location': 'private' } : {})
        };

        const wikiCtx = new WikiContext(engine, {
          context:     WikiContext.CONTEXT.EDIT,
          pageName:    slug,
          content:     ' ',
          userContext: await resolveUserContext(req)
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        await p.savePageWithContext(wikiCtx as any, metadata);

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
          lastModified: new Date().toISOString()
        };
        await jdm()?.indexEntry(indexEntry);

        res.redirect(`/edit/${encodeURIComponent(slug)}`);
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  // ── GET /journal/:slug/edit ──────────────────────────────────────────────────
  // Redirect to the standard page editor so preview, user preferences, and all
  // /edit features are available. (#540)
  router.get('/:slug/edit', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();

        const slug  = sp(req.params['slug']);
        const entry = await jdm()?.getBySlug(slug);
        if (!entry) { res.status(404).send('Journal entry not found.'); return; }

        const isOwner = entry.author === ctx.username;
        const isAdmin = (ctx.roles ?? []).includes('admin');
        if (!isOwner && !isAdmin) { res.status(403).send('Access denied.'); return; }

        res.redirect(`/edit/${encodeURIComponent(slug)}`);
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  // ── POST /journal/:slug/delete ───────────────────────────────────────────────
  router.post('/:slug/delete', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();

        const slug  = sp(req.params['slug']);
        const entry = await jdm()?.getBySlug(slug);
        if (!entry) { res.status(404).send('Journal entry not found.'); return; }

        const isOwner = entry.author === ctx.username;
        const isAdmin = (ctx.roles ?? []).includes('admin');
        if (!isOwner && !isAdmin) { res.status(403).send('Access denied.'); return; }

        const p = pm();
        if (!p) { res.status(503).send('PageManager not available'); return; }

        const wikiCtx = new WikiContext(engine, {
          context:     WikiContext.CONTEXT.EDIT,
          pageName:    slug,
          content:     ' ',
          userContext: await resolveUserContext(req)
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        await p.deletePageWithContext(wikiCtx as any);
        await jdm()?.removeEntry(entry.uuid);

        res.redirect('/journal');
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  return router;
}

