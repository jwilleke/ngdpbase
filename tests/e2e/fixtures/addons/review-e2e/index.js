/**
 * E2E fixture add-on for core's reviews (#2072). Never bundled: a throwaway
 * instance loads it by adding this folder's parent to
 * `ngdpbase.managers.addons-manager.addons-path` and setting
 * `ngdpbase.addons.review-e2e.enabled: true` (see tests/e2e/reviews.spec.ts).
 *
 * It provides one form that needs review, decided by holders of
 * `admin-system`: each submission is filed with core's reviews, and is
 * carried out (marked processed) when a reviewer approves it.
 */

const ADDON = 'review-e2e';

export default {
  name: ADDON,
  version: '1.0.0',
  description: 'E2E fixture: a form that needs review (#2072)',
  author: 'ngdpbase tests',
  dependencies: ['forms'],

  async register(engine, _config, host) {
    const forms = engine.getManager('FormsDataManager');
    if (!forms) return;
    await forms.registerShippedForm(ADDON, {
      id: 'e2e-2072-review',
      title: 'E2E 2072 new owner',
      notify: false,
      review: { decidePermission: 'admin-system' },
      fields: [{ name: 'name', type: 'text', label: 'Name', required: true }]
    }, host.systemContext(`${ADDON}: register the form it provides`));
  },

  async status() {
    return { healthy: true, message: 'review-e2e fixture loaded' };
  }
};
