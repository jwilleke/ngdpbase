/**
 * Where an operator reads about the settings a boot refuses without (#1953).
 *
 * SETUP.md's "Required settings" section lists each one with why; `.env.example`
 * is the full list of variables. Every refusal for a missing or wrong required
 * setting ends with this line, so the operator who hits one learns about the
 * others in the same read instead of one boot at a time.
 */
export const REQUIRED_SETTINGS_HELP =
  'See "Required settings" in SETUP.md: https://github.com/jwilleke/ngdpbase/blob/master/SETUP.md#required-settings';
