/**
 * Who may submit a form: `form-submit`, unless the form's definition names its own
 * `submitPermission` (#2548), which is then asked instead. A form that names none
 * sees no change.
 */

export const SUBMIT_PERMISSION = 'form-submit';

/**
 * The permission names the site declares, or null when they cannot be read.
 * Never throws: a route must not answer with the error's text.
 */
export function declaredPermissionNames(engine: { getManager(name: string): unknown }): ReadonlySet<string> | null {
  try {
    const settings = engine.getManager('ConfigurationManager') as
      { getProperty?: (key: string, fallback: unknown) => unknown } | null | undefined;
    const definitions = typeof settings?.getProperty === 'function'
      ? settings.getProperty('ngdpbase.permissions.definitions', null)
      : null;
    if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) return null;
    return new Set(Object.keys(definitions));
  } catch {
    return null;
  }
}

/**
 * The permission to ask before a form is submitted or drawn, or null when nobody
 * may: the form names one the site has not declared (a mistyped name would
 * otherwise be granted by a policy that matches anything, or by none), the
 * declared names cannot be read to vouch for it, or the value is not a name.
 * A form that names none asks `form-submit`, which is the add-on's own and needs
 * no vouching. It is never the fallback for a name that fails.
 */
export function resolveSubmitPermission(
  form: { submitPermission?: string },
  declared: ReadonlySet<string> | null
): string | null {
  const named = form.submitPermission;
  if (named === undefined) return SUBMIT_PERMISSION;
  if (typeof named !== 'string' || named.trim() === '') return null;
  if (named === SUBMIT_PERMISSION) return named;
  return declared?.has(named) ? named : null;
}
