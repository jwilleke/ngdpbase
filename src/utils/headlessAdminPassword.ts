/**
 * Headless-install guard for the bootstrap admin password (#1087).
 *
 * `InstallService` documented a safety property the code did not have:
 *
 * > "There is no default — a headless install with that variable unset refuses
 * > to start."
 *
 * It did not refuse. `ngdpbase.user.security.defaultpassword` ships as the
 * literal `admin123`, and `UserManager.getBootstrapPassword()` falls back to a
 * matching hardcoded constant when the key is missing or blank. So a headless
 * container or k8s deploy with `NGDPBASE_ADMIN_PASSWORD` unset came up with
 * `admin` / `admin123` — failing *open*, onto a credential published in this
 * repository, where the documentation said it failed *closed*.
 *
 * This makes the documented behaviour real, for headless installs only.
 *
 * ## Why only headless
 *
 * A fresh local install coming up unattended so the setup wizard is reachable
 * is a deliberate, documented property (`config/app-default-config.json`, the
 * `_comment_user_security_defaultpassword` entry). There is a human present who
 * will see the startup banner that `isAdminUsingDefaultPassword()` drives, and
 * refusing to boot would strand them with no way in.
 *
 * An unattended deploy has neither the human nor the banner. That asymmetry is
 * the whole reason this guard is scoped the way it is.
 *
 * ## Why it compares the value rather than reading the variable
 *
 * The check cannot simply ask whether `NGDPBASE_ADMIN_PASSWORD` is set, because
 * the env-ref is opt-in: an operator supplies the password either by exporting
 * that variable *and* pointing the config key at it, or by setting the key
 * directly in `app-custom-config.json`. Both are legitimate. What actually
 * matters is whether the resolved password is still the well-known shipped one,
 * which catches both "variable unset" and "operator never changed the config".
 *
 * The cost is that an operator who deliberately chooses `admin123` is treated as
 * having chosen nothing. That is the right trade.
 */

/** The bootstrap password shipped in `config/app-default-config.json`. */
export const SHIPPED_BOOTSTRAP_PASSWORD = 'admin123';

/** Config key holding the bootstrap password. */
const PASSWORD_CONFIG_KEY = 'ngdpbase.user.security.defaultpassword';

/**
 * Refuse a headless install that would create the admin account on the shipped
 * password.
 *
 * Called only from the path that actually creates the account — an instance
 * that already has an admin never reaches it, so an existing deployment is
 * unaffected by a restart.
 *
 * @param resolvedPassword - The password `createDefaultAdmin` is about to use.
 * @param isHeadless - Whether `HEADLESS_INSTALL=true`.
 * @throws When headless and the password is absent or still the shipped one.
 */
export function assertHeadlessBootstrapPassword(
  resolvedPassword: string,
  isHeadless: boolean
): void {
  if (!isHeadless) return;

  const trimmed = (resolvedPassword ?? '').trim();
  const isUnset = trimmed === '';
  const isShipped = trimmed === SHIPPED_BOOTSTRAP_PASSWORD;

  if (!isUnset && !isShipped) return;

  // Deliberately does not echo the password. It is well-known, but writing a
  // credential into container logs is a habit worth not forming.
  throw new Error(
    '[UserManager] Refusing to create the bootstrap admin account: ' +
    'HEADLESS_INSTALL is set and no admin password has been configured, so the ' +
    'account would be created with the well-known password shipped in this ' +
    'repository. An unattended deploy has nobody to read the startup warning. ' +
    `Set NGDPBASE_ADMIN_PASSWORD and point \`${PASSWORD_CONFIG_KEY}\` at it ` +
    `("$NGDPBASE_ADMIN_PASSWORD"), or set \`${PASSWORD_CONFIG_KEY}\` directly in ` +
    'app-custom-config.json, then restart. (#1087)'
  );
}
