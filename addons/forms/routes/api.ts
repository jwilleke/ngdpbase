
import { Router, type Request, type Response } from 'express';
import { ApiContext } from '../../../dist/src/context/ApiContext.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type EmailManager from '../../../dist/src/managers/EmailManager.js';
import type NotificationManager from '../../../dist/src/managers/NotificationManager.js';
import { v4 as uuidv4 } from 'uuid';
import { buildSubmissionValidator, fieldErrors } from '../managers/FormsDataManager.js';
import type FormsDataManager from '../managers/FormsDataManager.js';
import type { FormSubmission } from '../managers/FormsDataManager.js';
import { resolveChoices } from '../managers/fieldOptions.js';
import { checkSubmitAccess } from '../managers/pageAccess.js';

type AddonRef = { callHandler(formId: string, submission: unknown, ctx: unknown): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> };

export default function apiRoutes(engine: WikiEngine, addon: AddonRef): Router {
  const router = Router();

  function fdm(): FormsDataManager | undefined {
    return engine.getManager<FormsDataManager>('FormsDataManager');
  }

  // ── POST /api/forms/submit/:formId ────────────────────────────────────────
  router.post('/submit/:formId', (req: Request, res: Response) => {
    void (async () => {
      try {
        const formId = String(req.params['formId']);
        const m = fdm();
        if (!m) { res.status(503).json({ ok: false, error: 'FormsDataManager not available' }); return; }

        const form = m.getDefinition(formId);
        if (!form) { res.status(404).json({ ok: false, error: `Form '${formId}' not found` }); return; }

        const body = req.body as Record<string, unknown>;
        const userContext = (req as Request & { userContext?: unknown }).userContext;

        // ── 1. The page the form is on decides who may submit it ───────────
        const pageName = typeof body['_page'] === 'string' ? body['_page'] : undefined;
        const access = await checkSubmitAccess(engine, userContext, pageName, formId);
        if (!access.ok) { res.status(access.status).json({ ok: false, error: access.error }); return; }

        // ── 2. Validate fields; a dropdown value must be one it offered ────
        const choices = await resolveChoices(engine, form.fields, userContext);
        const validator = buildSubmissionValidator(form, choices);
        const validationResult = validator.safeParse(body);
        if (!validationResult.success) {
          res.status(400).json({ ok: false, error: 'Please correct the marked fields', fields: fieldErrors(validationResult.error) });
          return;
        }

        // ── 3. Time range check ────────────────────────────────────────────
        const startTime = typeof body['startTime'] === 'string' ? body['startTime'] : undefined;
        const endTime   = typeof body['endTime']   === 'string' ? body['endTime']   : undefined;
        if (startTime && endTime && endTime <= startTime) {
          res.status(400).json({ ok: false, error: 'End time must be later than start time', fields: { endTime: 'End time must be later than start time' } });
          return;
        }

        // ── 4. Build submission ────────────────────────────────────────────
        const ctx = ApiContext.from(req, engine);
        const submittedBy = ctx.username ?? 'anonymous';

        let onBehalfOf: Record<string, string | undefined> | undefined;
        if (form.proxySubmission && body['onBehalfOf'] && typeof body['onBehalfOf'] === 'object') {
          const obo = body['onBehalfOf'] as Record<string, unknown>;
          const oboName    = typeof obo['name']    === 'string' ? obo['name'].trim()    : '';
          const oboEmail   = typeof obo['email']   === 'string' ? obo['email'].trim()   : '';
          const oboPhone   = typeof obo['phone']   === 'string' ? obo['phone'].trim()   : '';
          const oboAddress = typeof obo['address'] === 'string' ? obo['address'].trim() : '';
          const anyFilled  = oboName || oboEmail || oboPhone || oboAddress;
          if (anyFilled && !oboName) {
            res.status(400).json({ ok: false, error: 'Full Name is required when submitting on behalf of someone.' });
            return;
          }
          if (anyFilled) {
            onBehalfOf = {
              name:    oboName    || undefined,
              email:   oboEmail   || undefined,
              phone:   oboPhone   || undefined,
              address: oboAddress || undefined
            };
          }
        }

        const submission: FormSubmission = {
          id: uuidv4(),
          formId,
          submittedAt: new Date().toISOString(),
          submittedBy,
          onBehalfOf,
          data: validationResult.data,
          status: 'pending'
        };

        // ── 5. Handler first: a refused submission leaves nothing behind ───
        const handlerResult = await addon.callHandler(formId, submission, { engine, req });
        if (!handlerResult.ok) {
          const { error, fields, status, reauth } = handlerResult as { error?: string; fields?: unknown; status?: unknown; reauth?: unknown };
          const code = typeof status === 'number' && status >= 400 && status < 500 ? status : 409;
          // Only this site's re-authenticate page: a handler cannot send the person elsewhere.
          const safeReauth = typeof reauth === 'string' && reauth.startsWith('/auth/reauth?') ? reauth : undefined;
          res.status(code).json({
            ok: false,
            error: error ?? 'Handler rejected submission',
            ...(fields && typeof fields === 'object' ? { fields } : {}),
            ...(safeReauth ? { reauth: safeReauth } : {})
          });
          return;
        }

        // ── 6. Keep the submission, unless the form says the handler's record is the record
        if (form.store !== false) await m.saveSubmission(submission);

        // ── 7. Email confirmation (fire-and-forget) ────────────────────────
        const emailManager = engine.getManager<EmailManager>('EmailManager');
        const submitterEmail = typeof body['email'] === 'string'
          ? body['email']
          : onBehalfOf?.email;

        if (emailManager?.isEnabled() && submitterEmail) {
          const subject = `[Submitted] ${form.title}`;
          const cm = engine.getManager<import('../../../dist/src/managers/ConfigurationManager.js').default>('ConfigurationManager');
          const baseUrl = (cm?.getProperty('ngdpbase.application.base-url', '') as string).replace(/\/$/, '');

          // Build detail lines from submission data for fields with values
          const data = submission.data as Record<string, string>;
          const detailFields = form.fields.filter(f =>
            !['hidden', 'checkbox', 'section'].includes(f.type) && data[f.name]
          );
          const details = detailFields
            .map(f => `  ${f.label}: ${data[f.name]}`)
            .join('\n');

          const obo = submission.onBehalfOf;
          const requesterBlock = obo?.name
            ? `Submitted for: ${obo.name}${obo.email ? ` <${obo.email}>` : ''}${obo.phone ? ` · ${obo.phone}` : ''}\n`
            : '';

          const linkLine = form.confirmationUrl
            ? `\nView reservation: ${baseUrl}${form.confirmationUrl}\n`
            : '';

          const text = [
            `Your submission for "${form.title}" has been received.`,
            '',
            requesterBlock + (details ? `Details:\n${details}` : ''),
            linkLine,
            `Submission ID: ${submission.id}`
          ].join('\n').trim();

          emailManager.sendTo(submitterEmail, subject, text).catch(() => {});
        }

        // ── 8. In-app notification (fire-and-forget) ───────────────────────
        const nm = engine.getManager<NotificationManager>('NotificationManager');
        if (nm) {
          nm.createNotification({
            type:    'system',
            title:   `New form submission: ${form.title}`,
            message: `Submitted by ${submittedBy}${onBehalfOf?.name ? ` on behalf of ${onBehalfOf.name}` : ''}`,
            level:   'info'
          }).catch(() => {});
        }

        res.status(201).json({ ok: true, submissionId: submission.id });
      } catch (err) {
        console.error('[forms] submit error:', err);
        res.status(500).json({ ok: false, error: 'Internal server error' });
      }
    })();
  });

  // ── GET /api/forms/schema/:formId ─────────────────────────────────────────
  router.get('/schema/:formId', (req: Request, res: Response) => {
    const m = fdm();
    if (!m) { res.status(503).json({ error: 'FormsDataManager not available' }); return; }
    const form = m.getDefinition(String(req.params['formId']));
    if (!form) { res.status(404).json({ error: 'Form not found' }); return; }
    // Strip optionsSource from response; resolved options are server-side only
    res.json(form);
  });

  return router;
}
