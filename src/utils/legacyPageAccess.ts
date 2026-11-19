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

/**
 * What a leftover `access:` limited, in the words an administrator reads, in a
 * fixed order. `view` and `read` are reading; `edit` is changing; an action
 * this list does not know is "use".
 */
export type AccessLimits = LimitedAction[];
export type LimitedAction = 'read' | 'change' | 'create' | 'delete' | 'rename' | 'upload' | 'export' | 'use';

const ACTION_ORDER: LimitedAction[] = ['read', 'change', 'create', 'delete', 'rename', 'upload', 'export', 'use'];
const ACTION_WORDS: Record<string, LimitedAction> = {
  view: 'read', read: 'read', edit: 'change', create: 'create', delete: 'delete', rename: 'rename', upload: 'upload', export: 'export'
};

/**
 * A page's system-category as the policies read it: trimmed and lowercased,
 * and the site's default when it names none. One reading for the policy code
 * and this list, so the install-stamp exemption cannot disagree with it.
 */
export function normalizeSystemCategory(raw: unknown, fallback: string | undefined): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim().toLowerCase();
  return fallback?.toLowerCase() ?? 'general';
}

/** The stamp install wrote on shipped pages outside `general` (#971, #1411): exactly `{ edit: [admin] }`. */
export function isInstallAccessStamp(access: unknown): boolean {
  if (!access || typeof access !== 'object' || Array.isArray(access)) return false;
  const entries = Object.entries(access as Record<string, unknown>);
  return entries.length === 1 && entries[0][0] === 'edit'
    && Array.isArray(entries[0][1]) && entries[0][1].length === 1 && entries[0][1][0] === 'admin';
}

/** What an `access:` value limited: each action with a non-empty list. An empty list or a non-object states none. */
export function legacyAccessLimits(access: unknown): AccessLimits {
  if (!access || typeof access !== 'object' || Array.isArray(access)) return [];
  const found = new Set<LimitedAction>();
  for (const [action, list] of Object.entries(access as Record<string, unknown>)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    found.add(Object.hasOwn(ACTION_WORDS, action) ? ACTION_WORDS[action] : 'use');
  }
  return ACTION_ORDER.filter((word) => found.has(word));
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
 * @param defaultCategory - the site's category for a page that names none (`general` when omitted)
 */
export function limitsLeftByUpgrade(
  metadata: { access?: unknown; 'system-category'?: unknown } | null | undefined,
  shipped: boolean,
  defaultCategory?: string
): AccessLimits | null {
  const access = metadata?.access;
  if (access === undefined) return null;
  const category = normalizeSystemCategory(metadata?.['system-category'], defaultCategory);
  if (shipped && category !== 'general' && isInstallAccessStamp(access)) return null;
  const limits = legacyAccessLimits(access);
  return limits.length > 0 ? limits : null;
}
