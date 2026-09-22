
/**
 * Editor routes for the journal add-on.
 * Mounted at /journal in register() (after public routes).
 *
 * Endpoints:
 *   GET  /journal/settings      — user preferences form
 *   POST /journal/settings      — save user preferences
 *   GET  /journal/new           — auto-creates today's stub entry, redirects to its editor
 *   GET  /journal/:slug/edit    — redirects to the entry's editor (/edit/… or /private/…/edit, #1456)
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
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
import { jobContextFromRequest } from '../../../dist/src/context/JobContext.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type PageManager from '../../../dist/src/managers/PageManager.js';
import type UserManager from '../../../dist/src/managers/UserManager.js';
import type JournalDataManager from '../managers/JournalDataManager.js';
import { pageUrl } from '../../../dist/src/utils/pageUrl.js';
import { getLeftMenu, findJournalEntryName, createJournalEntry } from './helpers.js';

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
            streakVisible:    prefs['journal.streakVisible']    !== false,
            // #802 — Default Journal Visibility. Defaults to true (privacy-first).
            defaultPrivate:   prefs['journal.defaultPrivate']   !== false
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
          'journal.voiceToText':    body['voiceToText']    === 'on',
          'journal.reminderEnabled': body['reminderEnabled'] === 'on',
          'journal.reminderTime':   typeof body['reminderTime'] === 'string' && body['reminderTime'].trim()
            ? body['reminderTime'].trim()
            : '20:00',
          'journal.streakVisible':  body['streakVisible']  === 'on',
          // #802 — Default Journal Visibility. Absence on the submitted form
          // means the user unchecked it (this surface always renders the field,
          // unlike _profile-section.ejs which has admin-disabled gating).
          'journal.defaultPrivate': body['defaultPrivate'] === 'on'
        };

        await userManager.updateUser(ctx.username!, { preferences: updated }, jobContextFromRequest(ctx));
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

        // If there is an entry for the date already, go straight to its editor.
        const name = await findJournalEntryName(engine, date, username, req.userContext)
          ?? await createJournalEntry(engine, config, req.userContext, date);
        res.redirect(pageUrl(name, 'edit'));
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  // ── GET /journal/:slug/edit ──────────────────────────────────────────────────
  // Redirect to the standard page editor so preview, user preferences, and all
  // /edit features are available. (#540)
  //
  // #1456: /journal/new now opens a new entry's editor directly, so an entry
  // reached here has been saved through the editor and is listed.
  router.get('/:slug/edit', (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();

        const slug = sp(req.params['slug']);
        // #1456: found among the entries this requester may list, public or
        // their own private ones, and opened by the entry's page name.
        const entry = await jdm()?.getBySlug(slug, req.userContext);
        if (!entry) { res.status(404).send('Journal entry not found.'); return; }

        const author = entry.author;
        const isOwner = author === ctx.username;
        const isAdmin = (ctx.roles ?? []).includes('admin');
        if (!isOwner && !isAdmin) { res.status(403).send('Access denied.'); return; }

        res.redirect(pageUrl(entry.name, 'edit'));
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

        const slug = sp(req.params['slug']);
        const p = pm();
        if (!p) { res.status(503).send('PageManager not available'); return; }

        // #1456: found among the entries this requester may list, and deleted by its page name.
        const entry = await jdm()?.getBySlug(slug, req.userContext);
        if (!entry) { res.status(404).send('Journal entry not found.'); return; }

        const author = entry.author;
        const uuid   = entry.uuid;
        const isOwner = author === ctx.username;
        const isAdmin = (ctx.roles ?? []).includes('admin');
        if (!isOwner && !isAdmin) { res.status(403).send('Access denied.'); return; }

        // #1462 slice 3: one delete door — the entry's page name and the
        // requester's own subject, with no WikiContext built to carry them.
        await p.deletePage(entry.name, req.userContext);
        if (uuid) await jdm()?.removeEntry(uuid);

        res.redirect('/journal');
      } catch (err) {
        handleError(err, res);
      }
    })();
  });

  return router;
}

