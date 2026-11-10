/**
 * To-do: passkeys are on but the site's address cannot support them (#2340, follows #2317).
 *
 * Worked out from the setting and the address each time Admin is shown, so it appears while both hold
 * and goes when passkeys are turned off or the address supports them. The rule is AuthManager's
 * `passkeysCannotWork()`, the one Admin → Configuration uses. The button posts to the ordinary
 * configuration save, so the permission check, the fresh sign-in and the audit are that save's.
 */
import type { WikiEngine } from '../types/WikiEngine.js';
import type { LiveUpgradeCheck, UpgradeItem } from '../managers/UpgradeCheckManager.js';
import type AuthManager from '../managers/AuthManager.js';
import { PASSKEYS_CANNOT_WORK, PASSKEYS_OFF_BUTTON, PASSKEYS_OFF_HINT, PASSKEY_SETTING } from '../utils/passkeyAddressWording.js';

/** The site address row in Admin → Configuration. */
export const ADDRESS_URL = '/admin/configuration#config-ngdpbase.application.base-url';

export function passkeyAddressCheck(engine: WikiEngine): LiveUpgradeCheck {
  return {
    id: 'passkeys-need-https',
    async items(): Promise<UpgradeItem[]> {
      if (!engine.getManager<AuthManager>('AuthManager')?.passkeysCannotWork?.()) return [];
      return [{
        text: PASSKEYS_CANNOT_WORK,
        link: { label: 'Change the site address', href: ADDRESS_URL },
        action: { label: PASSKEYS_OFF_BUTTON, property: PASSKEY_SETTING, value: 'false', note: PASSKEYS_OFF_HINT }
      }];
    }
  };
}
