
import { Router, type Request, type Response } from 'express';
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type FormsDataManager from '../managers/FormsDataManager.js';
import { FormDefinitionSchema, type FormField } from '../managers/FormsDataManager.js';

export default function builderRoutes(engine: WikiEngine): Router {
  const router = Router();

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

  function assemblePayload(body: Record<string, unknown>, formId: string): Record<string, unknown> {
    return {
      id: formId,
      title: typeof body['title'] === 'string' ? body['title'].trim() : '',
      description: typeof body['description'] === 'string' && body['description'].trim() ? body['description'].trim() : undefined,
      handler: typeof body['handler'] === 'string' && body['handler'].trim() ? body['handler'].trim() : undefined,
      proxySubmission: body['proxySubmission'] === 'on' || body['proxySubmission'] === 'true',
      notifyRole: typeof body['notifyRole'] === 'string' && body['notifyRole'].trim() ? body['notifyRole'].trim() : 'admin',
      confirmationUrl: typeof body['confirmationUrl'] === 'string' && body['confirmationUrl'].trim() ? body['confirmationUrl'].trim() : undefined
    };
  }

  function handleAuthError(err: unknown, res: Response): boolean {
    if (err instanceof ApiError) {
      res.status(err.status).send(err.message);
      return true;
    }
    return false;
  }

  // ── GET / → redirect to list ─────────────────────────────────────────────────
  router.get('/', (_req: Request, res: Response) => {
    res.redirect('/addons/forms');
  });

  // ── GET /new → blank builder ─────────────────────────────────────────────────
  router.get('/new', async (req: Request, res: Response) => {
    try {
      const ctx = ApiContext.from(req, engine);
      ctx.requireAuthenticated();
      await ctx.requirePermission('admin-system'); // #1198: policy, not a role name
      res.render('forms-builder', { currentUser: req.userContext, form: null, isNew: true, errors: [] });
    } catch (err) {
      if (handleAuthError(err, res)) return;
      res.status(500).send(String(err));
    }
  });

  // ── GET /:formId → edit existing ─────────────────────────────────────────────
  router.get('/:formId', async (req: Request, res: Response) => {
    try {
      const ctx = ApiContext.from(req, engine);
      ctx.requireAuthenticated();
      await ctx.requirePermission('admin-system'); // #1198: policy, not a role name
      const form = fdm()?.getDefinition(String(req.params['formId']));
      if (!form) { res.status(404).send('Form not found'); return; }
      res.render('forms-builder', { currentUser: req.userContext, form, isNew: false, errors: [] });
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
        ctx.requireAuthenticated();
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const body = req.body as Record<string, unknown>;
        const rawId = typeof body['id'] === 'string' ? body['id'].trim() : '';
        const fields = parseFields(body['fieldsJson']);

        if (!fields) {
          res.status(400).render('forms-builder', {
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
          res.status(409).render('forms-builder', {
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
          res.status(400).render('forms-builder', {
            currentUser: req.userContext,
            form: payload,
            isNew: true,
            errors: result.error.errors.map(e => `${e.path.join('.') || 'form'}: ${e.message}`)
          });
          return;
        }

        await m.saveDefinition(result.data);
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
        ctx.requireAuthenticated();
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const formId = String(req.params['formId']);
        const m = fdm();
        if (!m) { res.status(503).send('Forms addon not available'); return; }
        if (!m.getDefinition(formId)) { res.status(404).send('Form not found'); return; }

        const body = req.body as Record<string, unknown>;
        const fields = parseFields(body['fieldsJson']);

        if (!fields) {
          res.status(400).render('forms-builder', {
            currentUser: req.userContext,
            form: { ...assemblePayload(body, formId), fields: [] },
            isNew: false,
            errors: ['Invalid field data — could not parse fields.']
          });
          return;
        }

        const payload = { ...assemblePayload(body, formId), fields };
        const result = FormDefinitionSchema.safeParse(payload);
        if (!result.success) {
          res.status(400).render('forms-builder', {
            currentUser: req.userContext,
            form: payload,
            isNew: false,
            errors: result.error.errors.map(e => `${e.path.join('.') || 'form'}: ${e.message}`)
          });
          return;
        }

        await m.saveDefinition(result.data);
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
        ctx.requireAuthenticated();
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const formId = String(req.params['formId']);
        const m = fdm();
        if (!m) { res.status(503).send('Forms addon not available'); return; }

        const form = m.getDefinition(formId);
        if (!form) { res.status(404).send('Form not found'); return; }

        const count = await m.getSubmissionCount(formId);
        if (count > 0) {
          res.status(409).render('forms-builder', {
            currentUser: req.userContext,
            form,
            isNew: false,
            errors: [`Cannot delete — ${count} submission${count !== 1 ? 's' : ''} exist. Clear all submissions first.`]
          });
          return;
        }

        await m.deleteDefinition(formId);
        res.redirect('/addons/forms?flash=deleted');
      } catch (err) {
        if (handleAuthError(err, res)) return;
        res.status(500).send(String(err));
      }
    })();
  });

  return router;
}
