
/**
 * Forms Add-on for ngdpbase
 *
 * Schema-driven forms: define forms as JSON files, render on any wiki page
 * via [{Form id='my-form'}], store submissions, and trigger handler hooks.
 *
 * Configuration keys (in app-custom-config.json):
 *   ngdpbase.addons.forms.enabled     — true/false
 *   ngdpbase.addons.forms.dataPath    — path to forms data directory
 *   ngdpbase.addons.forms.notifyRole  — role to notify on submission (default: admin)
 *
 * Routes:
 *   POST /api/forms/submit/:formId        — submit a form
 *   GET  /api/forms/schema/:formId        — get form definition JSON
 *   GET  /addons/forms                     — list all forms + submission counts
 *   GET  /addons/forms/:formId/submissions — list submissions for a form
 *   GET  /addons/forms/:formId/submissions/:id — view a submission
 *   POST /addons/forms/:formId/submissions/:id/status — update submission status
 *   GET  /addons/forms/:formId/export.csv  — download a form's submissions as CSV
 *   POST /addons/forms/:formId/submissions/clear — remove a form's stored submissions (#1973)
 *
 * Shipping a form from another add-on (#1973):
 *   const forms = engine.getManager<FormsDataManager>('FormsDataManager');
 *   await forms?.registerShippedForm('my-addon', definition, host.systemContext('my-addon: register its forms'));
 * at every start. The site's copy is replaced whenever the installed add-on's
 * package.json version is newer than the one that wrote it, and is read-only
 * on the site.
 *
 * Handler hook:
 *   const formsAddon = engine.getManager('FormsAddon');
 *   formsAddon.registerHandler('my-form', async (submission, context) => {
 *     // ... do work ...
 *     return { ok: true };
 *     // or refuse, with a message per field shown next to it:
 *     // return { ok: false, error: 'Please correct the marked fields', fields: { amount: 'Too large' } };
 *   });
 *
 * The handler runs before the submission is stored; a refused submission leaves
 * nothing behind. A form with "store": false keeps no submission file at all —
 * the handler's own record is the record. A form with "notify": false sends no
 * "New form submission" notification and no email of the details (#1954).
 *
 * Who may submit: `form-submit`, asked through ApiContext.requirePermission like
 * every add-on route (#1749), so refusals, step-up and audit come from core. A
 * handler's own manager still asks its own permission; an ApiError it throws is
 * sent the same way. This add-on's default policy grants `form-submit` to
 * everyone, as before.
 */

import path from 'path';
import type { WikiEngine } from '../../dist/src/types/WikiEngine.js';
import type { AddonStatusDetails } from '../../dist/src/managers/AddonsManager.js';
import type PluginManager from '../../dist/src/managers/PluginManager.js';
import type AddonsManager from '../../dist/src/managers/AddonsManager.js';
import type ConfigurationManager from '../../dist/src/managers/ConfigurationManager.js';
import type { AddonHost } from '../../dist/src/utils/addonHost.js';
import type { ActorContext } from '../../dist/src/context/ActorContext.js';
import FormsDataManager from './managers/FormsDataManager.js';
import type { FormSubmission } from './managers/FormsDataManager.js';
import FormsPlugin from './plugins/FormsPlugin.js';
import { FORMS_REVIEW_HANDLER, formsReviewHandler } from './managers/review.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import builderRoutes from './routes/builder.js';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface HandlerResult {
  ok: boolean;
  error?: string;
  /** On a refusal: one message per field name, shown next to the field. */
  fields?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * What a form's handler is called with: the engine, the submitting request
 * (null when it runs on a reviewer's approval), and the reviewer's context
 * when the form needs review (#2072), null otherwise.
 */
export interface FormHandlerContext {
  engine: WikiEngine;
  req: unknown;
  decider: ActorContext | null;
}

export type FormHandler = (
  submission: FormSubmission,
  context: FormHandlerContext
) => Promise<HandlerResult>;


let dataManager: FormsDataManager | null = null;

const formsAddon = {
  name: 'forms',
  version: '1.0.0',
  description: 'Generic schema-driven forms — define JSON forms, render on wiki pages, store submissions, trigger hooks',
  author: 'Jim Willeke',
  dependencies: [] as string[],

  _handlers: new Map<string, FormHandler>(),

  /** What core handed this add-on at register (#1813); null until then. */
  _host: null as AddonHost | null,

  registerHandler(formId: string, handler: FormHandler): void {
    this._handlers.set(formId, handler);
    console.info(`[FormsAddon] Handler registered for form: ${formId}`);
  },

  async callHandler(
    formId: string,
    submission: FormSubmission,
    context: FormHandlerContext
  ): Promise<HandlerResult> {
    const handler = this._handlers.get(formId);
    if (!handler) return { ok: true };
    try {
      return await handler(submission, context);
    } catch (err) {
      // The handler's own permission check refused: the route sends it, as any add-on route would.
      if (this._host && err instanceof this._host.ApiError) throw err;
      console.error(`[FormsAddon] Handler error for form ${formId}:`, err);
      return { ok: false, error: 'Handler threw an unexpected error' };
    }
  },

  async register(engine: WikiEngine, config: Record<string, unknown>, host: AddonHost): Promise<void> {
    formsAddon._host = host;
    const cm = engine.getManager<ConfigurationManager>('ConfigurationManager');
    const dataPath = typeof config['dataPath'] === 'string' && config['dataPath'] !== ''
      ? config['dataPath']
      : (cm?.resolveDataPath?.('forms') ?? './data/forms');

    // ── 1. FormsDataManager ──────────────────────────────────────────────────
    dataManager = new FormsDataManager(engine, dataPath, host);
    await dataManager.initialize();
    await dataManager.convertSubmittersToIdentityIds();
    engine.registerManager('FormsDataManager', dataManager);

    // ── 2. Register self as FormsAddon so other addons can call registerHandler
    engine.registerManager('FormsAddon', formsAddon);

    // ── 3. Register markup plugin ────────────────────────────────────────────
    const pluginManager = engine.getManager<PluginManager>('PluginManager');
    if (pluginManager) {
      await pluginManager.registerPlugin('Form', FormsPlugin);
    }

    // ── 4. Serve static assets ───────────────────────────────────────────────
    engine.app?.use('/addons/forms', engine.serveStatic(path.join(__dirname, 'public')));

    // ── 5. Register stylesheet + dashboard card ──────────────────────────────
    const addonsManager = engine.getManager<AddonsManager>('AddonsManager');
    if (addonsManager) {
      addonsManager.registerStylesheet('/addons/forms/css/forms.css', 'forms');
      addonsManager.registerDashboardCard({
        addonName: 'forms',
        title: 'Forms',
        icon: 'fas fa-wpforms',
        adminUrl: '/addons/forms'
      });
    }

    // ── 6. Register views directory ──────────────────────────────────────────
    const existing = (engine.app?.get('views') as string | string[]) ?? [];
    engine.app?.set('views', [...[existing].flat(), path.join(__dirname, 'views')]);

    // ── 7. Mount routes ──────────────────────────────────────────────────────
    engine.app?.use('/api/forms',           apiRoutes(engine, formsAddon, host));
    engine.app?.use('/addons/forms/builder', builderRoutes(engine, host));
    engine.app?.use('/addons/forms',         adminRoutes(engine, formsAddon, host));

    // ── 8. "Needs review" (#2072): a submission to such a form is carried out
    // on a reviewer's approval, with the reviewer's context. Registered even
    // where core keeps no reviews, so a site that turns them on later works.
    try {
      host.registerReviewHandler(FORMS_REVIEW_HANDLER, formsReviewHandler({
        data: () => dataManager,
        callHandler: (formId, submission, decider) => formsAddon.callHandler(formId, submission, { engine, req: null, decider }),
        warn: (message) => host.logger.warn(message)
      }));
    } catch (err) {
      host.logger.warn(`[forms] "needs review" forms cannot be decided: ${(err as Error).message}`);
    }

    // ── 9. Announce capability ───────────────────────────────────────────────
    engine.setCapability('forms', true);
  },

  async status(): Promise<AddonStatusDetails> {
    const count = dataManager?.getAllDefinitions().length ?? 0;
    return {
      healthy: true,
      records: count,
      message: `Forms addon active — ${count} form definition${count === 1 ? '' : 's'} loaded`
    };
  },

  async shutdown(): Promise<void> {
    dataManager = null;
    this._host = null;
    this._handlers.clear();
  }
};

export default formsAddon;
