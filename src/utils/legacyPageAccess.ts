/**
 * Leftover `access:` frontmatter (#2269).
 *
 * Until #2255 a page's `access:` limited who could read or change it. Nothing
 * reads it now, so a page that still carries a limit has opened to whoever the
 * site's access rules allow, and the administrator needs to be told which.
 * Install also wrote `{ edit: [admin] }` on every page it ships outside
 * `general`; that stamp is not a limit anyone set and is left alone.
 *
 * Pure, so the page manager and the policy information point read it the same way.
 */

/** What a leftover `access:` once limited. */
export interface AccessLimits {
  /** Who could read the page (a `view` list) */
  read: boolean;
  /** Who could do anything else to it: edit, delete, rename */
  change: boolean;
}

/** The stamp install wrote on shipped pages outside `general` (#971, #1411): exactly `{ edit: [admin] }`. */
export function isInstallAccessStamp(access: unknown): boolean {
  if (!access || typeof access !== 'object' || Array.isArray(access)) return false;
  const entries = Object.entries(access as Record<string, unknown>);
  return entries.length === 1 && entries[0][0] === 'edit'
    && Array.isArray(entries[0][1]) && entries[0][1].length === 1 && entries[0][1][0] === 'admin';
}

/** What an `access:` value limited: a non-empty list is a limit, an empty list or a non-object states none. */
export function legacyAccessLimits(access: unknown): AccessLimits {
  const limits: AccessLimits = { read: false, change: false };
  if (!access || typeof access !== 'object' || Array.isArray(access)) return limits;
  for (const [action, list] of Object.entries(access as Record<string, unknown>)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    if (action === 'view') limits.read = true;
    else limits.change = true;
  }
  return limits;
}

/**
 * What the upgrade left open on a page, or null when it left nothing.
 *
 * The install stamp is exempt only where install wrote it: on a shipped page
 * outside `general`. The same value on a general page, or on a page the site
 * made itself, is someone's own rule.
 *
 * @param metadata - the page's frontmatter
 * @param shipped - whether the page is a copy of a page install ships
 */
export function limitsLeftByUpgrade(
  metadata: { access?: unknown; 'system-category'?: unknown } | null | undefined,
  shipped: boolean
): AccessLimits | null {
  const access = metadata?.access;
  if (access === undefined) return null;
  const category = typeof metadata?.['system-category'] === 'string' ? metadata['system-category'].toLowerCase() : undefined;
  if (shipped && category !== 'general' && isInstallAccessStamp(access)) return null;
  const limits = legacyAccessLimits(access);
  return limits.read || limits.change ? limits : null;
}
