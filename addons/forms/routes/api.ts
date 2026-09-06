
import { Router, type Request, type Response } from 'express';
import { ApiContext } from '../../../dist/src/context/ApiContext.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type EmailManager from '../../../dist/src/managers/EmailManager.js';
import type NotificationManager from '../../../dist/src/managers/NotificationManager.js';
import { buildSubmissionValidator } from '../managers/FormsDataManager.js';
import type FormsDataManager from '../managers/FormsDataManager.js';

type AddonRef = { callHandler(formId: string, submission: unknown, ctx: unknown): Promise<{ok: boolean; error?: string}> };

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

        // ── 1. Validate submission fields ──────────────────────────────────
        const validator = buildSubmissionValidator(form);
        const body = req.body as Record<string, unknown>;
        const validationResult = validator.safeParse(body);
        if (!validationResult.success) {
          res.status(400).json({ ok: false, error: 'Validation failed', fields: validationResult.error.format() });
          return;
        }

        // ── 2. Time range check ────────────────────────────────────────────
        const startTime = typeof body['startTime'] === 'string' ? body['startTime'] : undefined;
        const endTime   = typeof body['endTime']   === 'string' ? body['endTime']   : undefined;
        if (startTime && endTime && endTime <= startTime) {
          res.status(400).json({ ok: false, error: 'End time must be later than start time' });
          return;
        }

        // ── 3. Build submission ────────────────────────────────────────────
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

        // ── 4. Save submission ─────────────────────────────────────────────
        const submission = await m.saveSubmission({
          formId,
          submittedAt: new Date().toISOString(),
          submittedBy,
          onBehalfOf,
          data: validationResult.data,
          status: 'pending'
        });

        // ── 5. Call handler ────────────────────────────────────────────────
        const handlerResult = await addon.callHandler(formId, submission, { engine, req });
        if (!handlerResult.ok) {
          res.status(409).json({ ok: false, error: handlerResult.error ?? 'Handler rejected submission' });
          return;
        }

        // ── 6. Email confirmation (fire-and-forget) ────────────────────────
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

        // ── 7. In-app notification (fire-and-forget) ───────────────────────
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
