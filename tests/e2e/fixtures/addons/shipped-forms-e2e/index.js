/**
 * E2E fixture add-on for forms an add-on provides (#1973). Never bundled:
 * a throwaway instance loads it by adding this folder's parent to
 * `ngdpbase.managers.addons-manager.addons-path` and setting
 * `ngdpbase.addons.shipped-forms-e2e.enabled: true` (see
 * tests/e2e/forms-shipped.spec.ts).
 *
 * It provides two forms through `FormsDataManager.registerShippedForm`, at
 * this package's version:
 *   e2e-1973-provided  written at first start
 *   e2e-1973-legacy    first saved as a copy with no providedBy, as a site
 *                      from before #1973 holds it; registering it replaces it
 */

import { systemContext } from '../../../../../dist/src/context/bootActions.js';

const ADDON = 'shipped-forms-e2e';

/** What an earlier release left on the site, with no providedBy. */
function previous(id) {
  return {
    id,
    title: `E2E ${id}`,
    proxySubmission: false,
    notifyRole: 'admin',
    store: true,
    notify: true,
    fields: [
      { name: 'direction', type: 'dropdown', label: 'In or out', required: false, options: ['in', 'out'] },
      { name: 'check', type: 'text', label: 'Check number', required: false }
    ]
  };
}

/** What this release provides. */
function current(id) {
  return { id, title: `E2E ${id}`, notify: false, fields: [{ name: 'check', type: 'text', label: 'Reference' }] };
}

export default {
  name: ADDON,
  version: '1.0.0',
  description: 'E2E fixture: forms an add-on provides through registerShippedForm (#1973)',
  author: 'ngdpbase tests',
  dependencies: ['forms'],

  async register(engine) {
    const forms = engine.getManager('FormsDataManager');
    if (!forms) return;
    const ctx = systemContext(engine, `${ADDON}: register the forms it provides`);
    // The pre-#1973 copy exists only before the first registration replaces it.
    if (!forms.getDefinition('e2e-1973-legacy')) await forms.saveDefinition(previous('e2e-1973-legacy'), ctx);
    await forms.registerShippedForm(ADDON, current('e2e-1973-provided'), ctx);
    await forms.registerShippedForm(ADDON, current('e2e-1973-legacy'), ctx);
  },

  async status() {
    return { healthy: true, message: 'E2E fixture for forms an add-on provides' };
  }
};
