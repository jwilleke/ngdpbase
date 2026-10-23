/**
 * E2E fixture per-person add-on for the page audience `addon:<slug>` (#1964).
 * Never bundled: a throwaway instance loads it by adding this folder's parent
 * to `ngdpbase.managers.addons-manager.addons-path` and setting
 * `ngdpbase.addons.per-person-audience-e2e.enabled: true` (see
 * tests/e2e/page-audience-addon.spec.ts).
 *
 * It does one thing: a card on /profile with the person's switch, saved
 * through `host.setEnabledForPerson`, as a real per-person add-on does.
 */

const ADDON = 'per-person-audience-e2e';
let host = null;

export default {
  name: ADDON,
  version: '1.0.0',
  description: 'E2E fixture: a per-person add-on whose switch a page audience can name (#1964)',
  author: 'ngdpbase tests',

  register(_engine, _config, addonHost) {
    host = addonHost;
  },

  profileSection() {
    return {
      title: 'Audience E2E',
      html: `<input type="hidden" name="${ADDON}._rendered" value="1">` +
        `<label><input type="checkbox" name="${ADDON}.enabled"> Use the audience E2E add-on</label>`
    };
  },

  async saveProfileSection(ctx, body) {
    if (body[`${ADDON}._rendered`] !== '1') return;
    await host.setEnabledForPerson(ctx, body[`${ADDON}.enabled`] === 'on');
  },

  async status() {
    return { healthy: true, message: 'E2E fixture for the addon: page audience' };
  }
};
