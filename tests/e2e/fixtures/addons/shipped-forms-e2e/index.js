/**
 * E2E fixture add-on for shipped form definitions (#1880). Never bundled:
 * a throwaway instance loads it by adding this folder's parent to
 * `ngdpbase.managers.addons-manager.addons-path` and setting
 * `ngdpbase.addons.shipped-forms-e2e.enabled: true` (see
 * tests/e2e/forms-shipped.spec.ts).
 *
 * It ships six forms through `FormsDataManager.registerShippedForm`, and puts
 * each copy in the state a test needs, as an upgrade would leave it:
 *   e2e-1880-fresh     first install: saved from what it ships now
 *   e2e-1880-outdated  saved from the previous release's definition, unedited
 *   e2e-1880-edited    the same; the spec then edits it in the form builder
 *   e2e-1880-legacy    saved before #1880 (no stamp), differing from what ships
 *   e2e-1918-required  unedited, behind a change shipped as required (#1918)
 *   e2e-1918-required-edited  edited on this site, behind a required change
 *
 * Each start raises the admin notices for the copies left behind, once per
 * form and shipped version (#1918). `POST /e2e/shipped-forms/reset`
 * (admin-system) puts the forms back, registering them again as a restart
 * would, so the spec can run again without one. It touches only these forms.
 */

import { ApiContext, ApiError, sendApiError } from '../../../../../dist/src/context/ApiContext.js';

const ADDON = 'shipped-forms-e2e';
const IDS = ['e2e-1880-fresh', 'e2e-1880-outdated', 'e2e-1880-edited', 'e2e-1880-legacy', 'e2e-1918-required', 'e2e-1918-required-edited'];

/** The previous release's definition of a form. */
function previous(id) {
  return {
    id,
    title: `E2E ${id}`,
    fields: [
      { name: 'direction', type: 'dropdown', label: 'In or out', options: ['in', 'out'] },
      { name: 'check', type: 'text', label: 'Check number' }
    ]
  };
}

/** What this release ships. */
function current(id) {
  return { id, title: `E2E ${id}`, fields: [{ name: 'check', type: 'text', label: 'Reference' }] };
}

async function reset(forms) {
  for (const id of IDS) await forms.deleteDefinition(id);
  await forms.registerShippedForm(ADDON, current('e2e-1880-fresh'));
  for (const id of ['e2e-1880-outdated', 'e2e-1880-edited']) {
    await forms.registerShippedForm(ADDON, previous(id)); // the earlier release's first start
    await forms.registerShippedForm(ADDON, current(id)); // this release's start
  }
  await forms.saveDefinition(previous('e2e-1880-legacy')); // the pre-#1880 "save if missing"
  await forms.registerShippedForm(ADDON, current('e2e-1880-legacy'));
  // #1918: this release's change is one the add-on needs to work.
  await forms.registerShippedForm(ADDON, previous('e2e-1918-required'));
  await forms.registerShippedForm(ADDON, current('e2e-1918-required'), { required: true });
  await forms.registerShippedForm(ADDON, previous('e2e-1918-required-edited'));
  await forms.saveDefinition({ ...previous('e2e-1918-required-edited'), title: 'Edited on this site' }); // a builder edit
  await forms.registerShippedForm(ADDON, current('e2e-1918-required-edited'), { required: true });
}

export default {
  name: ADDON,
  version: '1.0.0',
  description: 'E2E fixture: forms shipped through registerShippedForm (#1880)',
  author: 'ngdpbase tests',
  dependencies: ['forms'],

  async register(engine) {
    const forms = engine.getManager('FormsDataManager');
    if (!forms) return;
    await reset(forms);

    const router = engine.createRouter();
    router.post('/reset', (req, res) => {
      void (async () => {
        try {
          await ApiContext.from(req, engine).requirePermission('admin-system');
          await reset(forms);
          res.json({ ok: true, ids: IDS });
        } catch (err) {
          if (err instanceof ApiError) { sendApiError(res, err); return; }
          res.status(500).json({ ok: false, error: String(err) });
        }
      })();
    });
    engine.app?.use('/e2e/shipped-forms', router);
  },

  async status() {
    return { healthy: true, message: 'E2E fixture for shipped forms' };
  }
};
