
import type { Router, Request, Response } from 'express';
import type { AddonHost } from '../../../dist/src/utils/addonHost.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type EmailManager from '../../../dist/src/managers/EmailManager.js';
import type NotificationManager from '../../../dist/src/managers/NotificationManager.js';
import type UserManager from '../../../dist/src/managers/UserManager.js';
import type ConfigurationManager from '../../../dist/src/managers/ConfigurationManager.js';
import { v4 as uuidv4 } from 'uuid';
import { buildSubmissionValidator, fieldErrors } from '../managers/FormsDataManager.js';
import type FormsDataManager from '../managers/FormsDataManager.js';
import type { FormSubmission } from '../managers/FormsDataManager.js';
import { resolveChoiceOptions, choiceValues } from '../managers/fieldOptions.js';
import { submissionAnswers, submissionDetails } from '../managers/submissionText.js';
import type { FormDefinition } from '../managers/FormsDataManager.js';
import type { ActorContext } from '../../../dist/src/context/ActorContext.js';
import { FORMS_REVIEW_HANDLER, REVIEW_FORM_KEY, REVIEW_SUBMISSION_KEY } from '../managers/review.js';
import type PluginManager from '../../../dist/src/managers/PluginManager.js';
import type IdentityManager from '../../../dist/src/managers/IdentityManager.js';

type AddonRef = { callHandler(formId: string, submission: FormSubmission, ctx: { engine: WikiEngine; req: unknown; decider: ActorContext | null }): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> };

export default function apiRoutes(engine: WikiEngine, addon: AddonRef, host: AddonHost): Router {
  const { ApiContext, ApiError, sendApiError, logger } = host;
  const router = engine.createRouter();

  function fdm(): FormsDataManager | undefined {
    return engine.getManager<FormsDataManager>('FormsDataManager');
  }

  /**
   * #2072: keep a submission to a form that needs review and file it with
   * core's reviews, for the holders of the form's `review.decidePermission`.
   * Returns why it could not be filed (the submission is then not kept), or
   * null when it was.
   */
  async function fileForReview(
    form: FormDefinition,
    submission: FormSubmission,
    filer: ActorContext,
    choiceOptions: Awaited<ReturnType<typeof resolveChoiceOptions>>
  ): Promise<string | null> {
    const m = fdm();
    if (!m || !form.review) return 'This form cannot be submitted right now';
    await m.saveSubmission(submission);
    const pluginManager = engine.getManager<PluginManager>('PluginManager');
    const answers = pluginManager ? submissionAnswers(form, submission.data, choiceOptions, pluginManager.formatters.formatMoney) : [];
    const details: Record<string, string> = {};
    for (const a of answers) details[a.label] = a.text;
    if (submission.onBehalfOf?.name) details['Submitted for'] = submission.onBehalfOf.name;
    details[REVIEW_FORM_KEY] = form.id;
    details[REVIEW_SUBMISSION_KEY] = submission.id;
    const shown = submission.submitterName ?? submission.submittedBy;
    const from = submission.onBehalfOf?.name ?? (shown.toLowerCase() !== 'anonymous' ? shown : 'someone not signed in');
    try {
      await host.reviews.fileRequest(filer, {
        kind: FORMS_REVIEW_HANDLER,
        subject: form.title,
        summary: `A submission to "${form.title}" from ${from}`,
        details,
        decidePermission: form.review.decidePermission,
        handlerId: FORMS_REVIEW_HANDLER
      });
      return null;
    } catch (err) {
      await m.discardSubmission(form.id, submission.id);
      logger.error(`[forms] a submission to '${form.id}' could not be filed for review, so it was not kept: ${(err as Error).message}`);
      return 'This form needs a review that is not available on this site right now, so it was not submitted. Please try again later.';
    }
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

        // ── 1. Who may submit: asked like every add-on route (#1749) ───────
        const ctx = ApiContext.from(req, engine);
        await ctx.requirePermission('form-submit');

        // ── 2. Validate fields; a dropdown value must be one it offered ────
        const choiceOptions = await resolveChoiceOptions(engine, form.fields, userContext);
        const validator = buildSubmissionValidator(form, choiceValues(choiceOptions));
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
        // #2041: the submitter by identity @id, their name kept for showing;
        // `anonymous`, or a name with no account, as given.
        const submitterName = ctx.username ?? 'anonymous';
        const identities = engine.getManager<IdentityManager>('IdentityManager');
        const submittedBy = submitterName.toLowerCase() !== 'anonymous' && identities
          ? (await identities.getByUserIdentifier(host.systemContext('forms: store a submitter as identity @id (#2041)'), submitterName))?.['@id'] ?? submitterName
          : submitterName;

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
          submitterName,
          onBehalfOf,
          // The add-on version the form came from (#1973); a site-built form has none.
          ...(form.providedBy ? { formVersion: form.providedBy.version } : {}),
          data: validationResult.data,
          status: 'pending'
        };

        if (form.review) {
          // ── 5a. "Needs review" (#2072): keep the submission and file it with
          // core's reviews; the form's handler runs when a reviewer approves it.
          const refused = await fileForReview(form, submission, ctx.getActor(), choiceOptions);
          if (refused) { res.status(503).json({ ok: false, error: refused }); return; }
        } else {
          // ── 5. Handler first: a refused submission leaves nothing behind ───
          const handlerResult = await addon.callHandler(formId, submission, { engine, req, decider: null });
          if (!handlerResult.ok) {
            const { error, fields } = handlerResult as { error?: string; fields?: unknown };
            res.status(409).json({
              ok: false,
              error: error ?? 'Handler rejected submission',
              ...(fields && typeof fields === 'object' ? { fields } : {})
            });
            return;
          }

          // ── 6. Keep the submission, unless the form says the handler's record is the record
          if (form.store !== false) await m.saveSubmission(submission);
        }

        // Steps 7 and 8 tell someone about the submission; a form with
        // "notify": false sends neither (#1954).
        const notify = form.notify !== false;

        // ── 7. Email confirmation (fire-and-forget) ────────────────────────
        const emailManager = engine.getManager<EmailManager>('EmailManager');
        const submitterEmail = typeof body['email'] === 'string'
          ? body['email']
          : onBehalfOf?.email;

        if (notify && emailManager?.isEnabled() && submitterEmail) {
          const subject = `[Submitted] ${form.title}`;
          const cm = engine.getManager<ConfigurationManager>('ConfigurationManager');
          const baseUrl = (cm?.getProperty('ngdpbase.application.base-url', '') as string).replace(/\/$/, '');

          // The details as the form showed them (#1915): the choices this
          // submitter was offered, money through core's formatter (#1820).
          const pluginManager = engine.getManager<PluginManager>('PluginManager');
          const details = pluginManager
            ? submissionDetails(form, submission.data, choiceOptions, pluginManager.formatters.formatMoney).join('\n')
            : '';

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

          // #1916: a failure is logged and reported to administrators by EmailManager;
          // the submission still succeeds.
          emailManager.sendInBackground(ctx.getActor(), submitterEmail, subject, text);
        }

        // ── 8. In-app notification to the form's notifyRole (fire-and-forget)
        // Only the role's members (#1957): an empty target list means every
        // user, so a role nobody holds is told nothing.
        const nm = engine.getManager<NotificationManager>('NotificationManager');
        const users = engine.getManager<UserManager>('UserManager');
        // A form that needs review: core tells the holders of its permission instead (#2072).
        if (notify && !form.review && nm && users && ctx.subject) {
          const notice = {
            title:   `New form submission: ${form.title}`,
            message: `Submitted by ${submitterName}${onBehalfOf?.name ? ` on behalf of ${onBehalfOf.name}` : ''}`,
            level:   'info' as const
          };
          // Core's role lookup (RoleManager membership, active accounts only);
          // limit 0 is every holder. Finding the recipients is the add-on's own
          // work, not the submitter searching for people, so it runs under the
          // system context (#2018): an anonymous submitter still notifies.
          const finder = host.systemContext(`forms: find the holders of '${form.notifyRole}' to notify of a submission to '${formId}'`);
          void users.searchUsers('', { role: form.notifyRole, limit: 0 }, finder).then((holders) => {
            const targetUsers = holders.map((u) => u.username);
            if (targetUsers.length === 0) {
              logger.debug(`[forms] nobody holds '${form.notifyRole}'; no notice for a submission to '${formId}'`);
              return;
            }
            return nm.createNotification({ ...notice, type: 'system', targetUsers });
          }).catch((err: unknown) => logger.warn(`[forms] could not notify '${form.notifyRole}' of a submission to '${formId}':`, err));
        }

        res.status(201).json({ ok: true, submissionId: submission.id, ...(form.review ? { review: 'pending' } : {}) });
      } catch (err) {
        if (err instanceof ApiError) { sendApiError(res, err); return; }
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
