
import type { Router, Request, Response } from 'express';
import type { AddonHost } from '../../../dist/src/utils/addonHost.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type FormsDataManager from '../managers/FormsDataManager.js';
import type { FormDefinition, FormSubmission, SubmissionStatus } from '../managers/FormsDataManager.js';
import type ExportManager from '../../../dist/src/managers/ExportManager.js';

/**
 * A form's submissions as a table for CSV (#1973): who and when, then one
 * column per field the form has, then any other key a submission carries
 * (a field since removed). A list or a row of lines is written as JSON.
 */
export function submissionsTable(form: FormDefinition, submissions: FormSubmission[]): { headers: string[]; rows: unknown[][] } {
  const names = form.fields.filter(f => f.type !== 'section').map(f => f.name);
  for (const s of submissions) {
    for (const key of Object.keys(s.data)) if (!names.includes(key)) names.push(key);
  }
  const headers = ['id', 'submittedAt', 'submittedBy', 'submitterName', 'status', 'formVersion',
    'onBehalfOf.name', 'onBehalfOf.email', 'onBehalfOf.phone', 'onBehalfOf.address', 'notes', ...names];
  const rows = submissions.map(s => [
    s.id, s.submittedAt, s.submittedBy, s.submitterName, s.status, s.formVersion,
    s.onBehalfOf?.name, s.onBehalfOf?.email, s.onBehalfOf?.phone, s.onBehalfOf?.address, s.notes,
    ...names.map(n => s.data[n])
  ]);
  return { headers, rows };
}

export default function adminRoutes(engine: WikiEngine, _addon: unknown, host: AddonHost): Router {
  const { ApiContext, ApiError, sendApiError } = host;
  const router = engine.createRouter();

  function fdm(): FormsDataManager | undefined {
    return engine.getManager<FormsDataManager>('FormsDataManager');
  }

  // ── GET /addons/forms ─────────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const m = fdm();
        const definitions = m?.getAllDefinitions() ?? [];

        const formsWithCounts = await Promise.all(
          definitions.map(async (form) => ({
            ...form,
            submissionCount: await m!.getSubmissionCount(form.id),
            // #1973: the add-on that no longer provides it, when it is an add-on's form
            orphanedFrom: m!.orphanedFrom(form.id)
          }))
        );

        res.render('forms-admin', { ...(await engine.templateData?.(req)),
          currentUser: req.userContext,
          forms: formsWithCounts,
          query: req.query
        });
      } catch (err) {
        if (err instanceof ApiError) { sendApiError(res, err, 'text'); return; }
        res.status(500).send(String(err));
      }
    })();
  });

  // ── GET /addons/forms/:formId/submissions ─────────────────────────────────
  router.get('/:formId/submissions', async (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const m = fdm();
        const form = m?.getDefinition(String(req.params['formId']));
        if (!form) { res.status(404).send('Form not found'); return; }

        const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
        let submissions = await m!.getSubmissions(String(req.params['formId']));
        if (status) submissions = submissions.filter(s => s.status === status);

        res.render('forms-submissions', { ...(await engine.templateData?.(req)),
          currentUser: req.userContext,
          form,
          submissions,
          filterStatus: status ?? 'all'
        });
      } catch (err) {
        if (err instanceof ApiError) { sendApiError(res, err, 'text'); return; }
        res.status(500).send(String(err));
      }
    })();
  });

  // ── GET /addons/forms/:formId/submissions/:submissionId ───────────────────
  router.get('/:formId/submissions/:submissionId', async (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const m = fdm();
        const form = m?.getDefinition(String(req.params['formId']));
        if (!form) { res.status(404).send('Form not found'); return; }

        const submissions = await m!.getSubmissions(String(req.params['formId']));
        const submission = submissions.find(s => s.id === String(req.params['submissionId']));
        if (!submission) { res.status(404).send('Submission not found'); return; }

        res.render('forms-submission-detail', { ...(await engine.templateData?.(req)),
          currentUser: req.userContext,
          form,
          submission
        });
      } catch (err) {
        if (err instanceof ApiError) { sendApiError(res, err, 'text'); return; }
        res.status(500).send(String(err));
      }
    })();
  });

  // ── GET /addons/forms/:formId/export.csv ──────────────────────────────────
  // #1973: every stored submission of one form, oldest first, through core's one CSV writer.
  router.get('/:formId/export.csv', async (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const m = fdm();
        const form = m?.getDefinition(String(req.params['formId']));
        if (!form) { res.status(404).send('Form not found'); return; }
        const exporter = engine.getManager<ExportManager>('ExportManager');
        if (!exporter) { res.status(503).send('ExportManager not available'); return; }

        const submissions = (await m!.getSubmissions(form.id)).reverse();
        const { headers, rows } = submissionsTable(form, submissions);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${form.id}-submissions.csv"`);
        res.send(exporter.toCsv(headers, rows));
      } catch (err) {
        if (err instanceof ApiError) { sendApiError(res, err, 'text'); return; }
        res.status(500).send(String(err));
      }
    })();
  });

  // ── POST /addons/forms/:formId/submissions/clear ──────────────────────────
  // #1973: remove a form's stored submissions so it can be deleted. Any form,
  // including one an add-on still provides; the admin types the form id.
  router.post('/:formId/submissions/clear', async (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const m = fdm();
        const formId = String(req.params['formId']);
        if (!m?.getDefinition(formId)) { res.status(404).send('Form not found'); return; }
        const body = req.body as Record<string, unknown>;
        const confirm = typeof body['confirm'] === 'string' ? body['confirm'].trim() : '';
        if (confirm !== formId) {
          res.redirect(`/addons/forms?flash=not-cleared&form=${encodeURIComponent(formId)}`);
          return;
        }

        const count = await m.clearSubmissions(formId, ctx.getActor());
        res.redirect(`/addons/forms?flash=cleared&form=${encodeURIComponent(formId)}&count=${count}`);
      } catch (err) {
        if (err instanceof ApiError) { sendApiError(res, err, 'text'); return; }
        res.status(500).send(String(err));
      }
    })();
  });

  // ── POST /addons/forms/:formId/submissions/:submissionId/status ───────────
  router.post('/:formId/submissions/:submissionId/status', async (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const body = req.body as Record<string, unknown>;
        const status = typeof body['status'] === 'string' ? body['status'] as SubmissionStatus : undefined;
        if (!status || !['pending', 'processed', 'rejected'].includes(status)) {
          res.status(400).json({ ok: false, error: 'Invalid status' });
          return;
        }

        const notes = typeof body['notes'] === 'string' ? body['notes'] : undefined;
        const m = fdm();
        const updated = await m?.updateStatus(String(req.params['submissionId']), String(req.params['formId']), status, notes);

        if (!updated) { res.status(404).json({ ok: false, error: 'Submission not found' }); return; }
        res.json({ ok: true });
      } catch (err) {
        if (err instanceof ApiError) { sendApiError(res, err); return; }
        res.status(500).json({ ok: false, error: String(err) });
      }
    })();
  });

  return router;
}
