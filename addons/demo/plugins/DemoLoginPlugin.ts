/**
 * DemoLoginPlugin — renders the shared demo account's credentials inline.
 *
 * Usage:
 *   [{DemoLogin}]
 *
 * Why this exists: the demo publishes a read-only dashboard login on its
 * Welcome page, and that page must never disagree with the account that
 * actually exists. Writing the password into the markdown makes it a copy,
 * and a copy is wrong the moment the operator changes the value. This reads
 * the same config key the addon seeds from, so the two cannot drift.
 *
 * DELIBERATELY UNMASKED. `ConfigAccessorPlugin` masks anything matching
 * /secret|password|token|credential/i for non-admins, which is correct there
 * and useless here — every demo visitor is a non-admin, and they are exactly
 * who needs to read it. So this is a single-purpose plugin: it renders ONE
 * hard-coded key and nothing else. It cannot be pointed at arbitrary config,
 * and it ships in an addon that is disabled by default and documented as for
 * public demo instances only.
 *
 * The consequence is blunt: whatever is in
 * `ngdpbase.addons.demo.admin-account.password` becomes world-readable on the
 * page carrying this plugin. That is the intended contract for a demo
 * credential. Never point it at a value you would not publish.
 */

import type { PluginContext, PluginParams } from '../../../dist/src/managers/PluginManager.js';
import type ConfigurationManager from '../../../dist/src/managers/ConfigurationManager.js';

const USERNAME_KEY = 'ngdpbase.addons.demo.admin-account.username';
const PASSWORD_KEY = 'ngdpbase.addons.demo.admin-account.password';

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A value that is still an unresolved `${VAR}` placeholder means the operator
 * supplied no password, so the addon seeded no account. Say so rather than
 * printing the placeholder as though it were a credential.
 */
function isUnset(value: unknown): boolean {
  return typeof value !== 'string' || value === '' || value.startsWith('${');
}

const DemoLoginPlugin = {
  name: 'DemoLogin',
  description: "Renders the demo instance's shared read-only admin credentials",
  author: 'Jim Willeke',
  version: '1.0.0',

  execute(context: PluginContext, _params: PluginParams): string {
    const configManager = context.engine?.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) return '';

    let username: unknown = 'admindemo';
    let password: unknown;
    try {
      username = configManager.getProperty(USERNAME_KEY, 'admindemo');
      password = configManager.getProperty(PASSWORD_KEY);
    } catch {
      // A bare env-ref naming an unset variable throws. Treat as unconfigured.
      password = undefined;
    }

    if (isUnset(password)) {
      return (
        '<div class="alert alert-warning" role="alert">' +
        '<strong>No demo login is configured.</strong> This instance\'s operator has not set a ' +
        'password for the shared dashboard account, so it was not created.' +
        '</div>'
      );
    }

    return (
      '<div class="alert alert-info" role="alert">' +
      'Username <code>' + escHtml(String(username)) + '</code> &nbsp;&middot;&nbsp; ' +
      'Password <code>' + escHtml(String(password)) + '</code>' +
      '</div>'
    );
  }
};

export default DemoLoginPlugin;
