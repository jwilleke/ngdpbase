/**
 * What an administrator reads when passkeys are on but the site's address cannot support them (#2317, #2340).
 * One home for the words, used by Admin → Configuration and by the "After updating" to-do list.
 */
export const PASSKEYS_CANNOT_WORK = "Passkeys can't work on this site's address. They need an https address.";
export const PASSKEYS_OFF_BUTTON = 'Turn passkeys off';
export const PASSKEYS_OFF_HINT = 'This saves right away. You can turn passkeys back on once the site uses https.';
/** The setting the button saves `false` to, through the ordinary Admin → Configuration save. */
export const PASSKEY_SETTING = 'ngdpbase.auth.passkey.enabled';
