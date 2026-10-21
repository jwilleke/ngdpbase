
import type { Router, Request, Response } from 'express';
import { ApiContext, ApiError, sendApiError } from '../../../dist/src/context/ApiContext.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type FormsDataManager from '../managers/FormsDataManager.js';
import { FormDefinitionSchema, ProvidedFormError, type FormDefinition, type FormField } from '../managers/FormsDataManager.js';

export default function builderRoutes(engine: WikiEngine): Router {
  const router = engine.createRouter();

  function fdm(): FormsDataManager | undefined {
    return engine.getManager<FormsDataManager>('FormsDataManager');
  }

  function parseFields(raw: unknown): FormField[] | null {
    if (typeof raw !== 'string') return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as FormField[]) : null;
    } catch {
      return null;
    }
  }

  /**
   * A default-on box: "Store submissions" (#1921), "Send notices" (#1954). An
   * unticked checkbox sends nothing, so the page sends `<name>Shown` beside it;
   * a post without that marker (a page loaded before the box existed) keeps
   * `current`.
   */
  function readBox(body: Record<string, unknown>, name: 'store' | 'notify', current: boolean): boolean {
    if (body[`${name}Shown`] === undefined) return current;
    return body[name] === 'on' || body[name] === 'true';
  }

  function assemblePayload(body: Record<string, unknown>, formId: string, current?: FormDefinition): Record<string, unknown> {
    return {
      id: formId,
      title: typeof body['title'] === 'string' ? body['title'].trim() : '',
      description: typeof body['description'] === 'string' && body['description'].trim() ? body['description'].trim() : undefined,
      handler: typeof body['handler'] === 'string' && body['handler'].trim() ? body['handler'].trim() : undefined,
      proxySubmission: body['proxySubmission'] === 'on' || body['proxySubmission'] === 'true',
      notifyRole: typeof body['notifyRole'] === 'string' && body['notifyRole'].trim() ? body['notifyRole'].trim() : 'admin',
      confirmationUrl: typeof body['confirmationUrl'] === 'string' && body['confirmationUrl'].trim() ? body['confirmationUrl'].trim() : undefined,
      store: readBox(body, 'store', current?.store ?? true),
      notify: readBox(body, 'notify', current?.notify ?? true)
    };
  }

  function handleAuthError(err: unknown, res: Response): boolean {
    if (err instanceof ApiError) {
      sendApiError(res, err, 'text');
      return true;
    }
    // #1973: the manager refuses a write to a form an add-on provides.
    if (err instanceof ProvidedFormError) {
      res.status(403).send(err.message);
      return true;
    }
    return false;
  }

  /**
   * #1973: a form an add-on provides is read-only on the site. Refused here,
   * before the builder page or a save is reached, and again by the manager.
   */
  function refuseProvided(form: FormDefinition, res: Response): boolean {
    if (!form.providedBy) return false;
    res.status(403).send(new ProvidedFormError(form).message);
    return true;
  }

  // ── GET / → redirect to list ─────────────────────────────────────────────────
  router.get('/', (_req: Request, res: Response) => {
    res.redirect('/addons/forms');
  });

  // ── GET /new → blank builder ─────────────────────────────────────────────────
  router.get('/new', async (req: Request, res: Response) => {
    try {
      const ctx = ApiContext.from(req, engine);
      await ctx.requirePermission('admin-system'); // #1198: policy, not a role name
      res.render('forms-builder', { ...(await engine.templateData?.(req)), currentUser: req.userContext, form: null, isNew: true, errors: [] });
    } catch (err) {
      if (handleAuthError(err, res)) return;
      res.status(500).send(String(err));
    }
  });

  // ── GET /:formId → edit existing ─────────────────────────────────────────────
  router.get('/:formId', async (req: Request, res: Response) => {
    try {
      const ctx = ApiContext.from(req, engine);
      await ctx.requirePermission('admin-system'); // #1198: policy, not a role name
      const form = fdm()?.getDefinition(String(req.params['formId']));
      if (!form) { res.status(404).send('Form not found'); return; }
      if (refuseProvided(form, res)) return;
      res.render('forms-builder', { ...(await engine.templateData?.(req)), currentUser: req.userContext, form, isNew: false, errors: [] });
    } catch (err) {
      if (handleAuthError(err, res)) return;
      res.status(500).send(String(err));
    }
  });

  // ── POST / → create new definition ──────────────────────────────────────────
  router.post('/', async (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const body = req.body as Record<string, unknown>;
        const rawId = typeof body['id'] === 'string' ? body['id'].trim() : '';
        const fields = parseFields(body['fieldsJson']);

        if (!fields) {
          res.status(400).render('forms-builder', { ...(await engine.templateData?.(req)),
            currentUser: req.userContext,
            form: { ...assemblePayload(body, rawId), fields: [] },
            isNew: true,
            errors: ['Invalid field data — could not parse fields.']
          });
          return;
        }

        const m = fdm();
        if (!m) { res.status(503).send('Forms addon not available'); return; }

        if (m.getDefinition(rawId)) {
          res.status(409).render('forms-builder', { ...(await engine.templateData?.(req)),
            currentUser: req.userContext,
            form: { ...assemblePayload(body, rawId), fields },
            isNew: true,
            errors: [`A form with ID "${rawId}" already exists — edit it instead.`]
          });
          return;
        }

        const payload = { ...assemblePayload(body, rawId), fields };
        const result = FormDefinitionSchema.safeParse(payload);
        if (!result.success) {
          res.status(400).render('forms-builder', { ...(await engine.templateData?.(req)),
            currentUser: req.userContext,
            form: payload,
            isNew: true,
            errors: result.error.issues.map(e => `${e.path.join('.') || 'form'}: ${e.message}`)
          });
          return;
        }

        await m.saveDefinition(result.data, ctx.getActor());
        res.redirect('/addons/forms?flash=saved');
      } catch (err) {
        if (handleAuthError(err, res)) return;
        res.status(500).send(String(err));
      }
    })();
  });

  // ── POST /:formId → update existing ─────────────────────────────────────────
  router.post('/:formId', async (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const formId = String(req.params['formId']);
        const m = fdm();
        if (!m) { res.status(503).send('Forms addon not available'); return; }
        const current = m.getDefinition(formId);
        if (!current) { res.status(404).send('Form not found'); return; }
        if (refuseProvided(current, res)) return;

        const body = req.body as Record<string, unknown>;
        const fields = parseFields(body['fieldsJson']);

        if (!fields) {
          res.status(400).render('forms-builder', { ...(await engine.templateData?.(req)),
            currentUser: req.userContext,
            form: { ...assemblePayload(body, formId, current), fields: [] },
            isNew: false,
            errors: ['Invalid field data — could not parse fields.']
          });
          return;
        }

        const payload = { ...assemblePayload(body, formId, current), fields };
        const result = FormDefinitionSchema.safeParse(payload);
        if (!result.success) {
          res.status(400).render('forms-builder', { ...(await engine.templateData?.(req)),
            currentUser: req.userContext,
            form: payload,
            isNew: false,
            errors: result.error.issues.map(e => `${e.path.join('.') || 'form'}: ${e.message}`)
          });
          return;
        }

        await m.saveDefinition(result.data, ctx.getActor());
        res.redirect('/addons/forms?flash=saved');
      } catch (err) {
        if (handleAuthError(err, res)) return;
        res.status(500).send(String(err));
      }
    })();
  });

  // ── POST /:formId/delete → delete definition ─────────────────────────────────
  router.post('/:formId/delete', async (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const formId = String(req.params['formId']);
        const m = fdm();
        if (!m) { res.status(503).send('Forms addon not available'); return; }

        const form = m.getDefinition(formId);
        if (!form) { res.status(404).send('Form not found'); return; }
        // #1973: a form its add-on no longer provides may be deleted; one it still provides may not.
        const orphaned = form.providedBy !== undefined && m.orphanedFrom(formId) !== undefined;
        if (!orphaned && refuseProvided(form, res)) return;

        const count = await m.getSubmissionCount(formId);
        if (count > 0) {
          const why = `Cannot delete — ${count} submission${count !== 1 ? 's' : ''} exist. Clear all submissions first.`;
          // An add-on's form has no builder page to show the reason on.
          if (orphaned) { res.status(409).send(why); return; }
          res.status(409).render('forms-builder', { ...(await engine.templateData?.(req)),
            currentUser: req.userContext,
            form,
            isNew: false,
            errors: [why]
          });
          return;
        }

        await m.deleteDefinition(formId, ctx.getActor());
        res.redirect('/addons/forms?flash=deleted');
      } catch (err) {
        if (handleAuthError(err, res)) return;
        res.status(500).send(String(err));
      }
    })();
  });

  return router;
}
