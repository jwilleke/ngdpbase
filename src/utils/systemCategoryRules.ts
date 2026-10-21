/**
 * The rules a `ngdpbase.system-category` entry's values follow
 * (docs/system-category.md, "The fields"), said once for every reader: the
 * configuration merge, which refuses an add-on's entry that breaks them
 * (#1559), and ValidationManager, which checks the site's own entries at
 * startup.
 */

export const SYSTEM_CATEGORY_KEY = 'ngdpbase.system-category';

/**
 * The fields of an entry that are its `owner`'s declaration (operator,
 * 2026-09-29): `encrypt` and `defaultPrivate` stand, and `shareMaxDays` is
 * decided by the owner. For an entry an add-on declares, a site's
 * `app-custom-config.json` never changes them, nor `owner` itself.
 */
export const OWNER_DECIDED_FIELDS = ['owner', 'encrypt', 'defaultPrivate', 'shareMaxDays'] as const;

/** One mistyped value: what is wrong, and what every reader takes it to mean. */
export interface SystemCategoryValueProblem {
  /** Names the entry, the field and the bad value. */
  message: string;
  /** What the value is read as, and what that does. */
  readAs: string;
}

/**
 * What is wrong with the types of one entry's values, one per field, naming
 * the entry and the field. Empty when sound. `defaultPrivate` is the boolean
 * `true` or `false`, or the string `"choice"`; `encrypt`, `comments` and
 * `footnotes` are booleans.
 * Any other `defaultPrivate` or `encrypt` is compared as false by every
 * reader, so the string `"true"` would start pages public and leave the vault
 * unsealed. Any other `comments` or `footnotes` is read as on, since only
 * `false` turns a tab off.
 */
export function systemCategoryValueProblems(key: string, entry: unknown): SystemCategoryValueProblem[] {
  if (!entry || typeof entry !== 'object') return [];
  const e = entry as { defaultPrivate?: unknown; encrypt?: unknown; comments?: unknown; footnotes?: unknown };
  const problems: SystemCategoryValueProblem[] = [];
  if (e.defaultPrivate !== undefined && e.defaultPrivate !== true && e.defaultPrivate !== false && e.defaultPrivate !== 'choice') {
    problems.push({
      message: `system-category '${key}': defaultPrivate must be true, false or "choice", got ${JSON.stringify(e.defaultPrivate)}`,
      readAs: 'it is read as false, so new pages start public'
    });
  }
  if (e.encrypt !== undefined && typeof e.encrypt !== 'boolean') {
    problems.push({
      message: `system-category '${key}': encrypt must be true or false, got ${JSON.stringify(e.encrypt)}`,
      readAs: 'it is read as false, so the vault is not sealed'
    });
  }
  // #1951: only the boolean false turns a page's Comments or Footnotes tab off.
  for (const kind of ['comments', 'footnotes'] as const) {
    if (e[kind] !== undefined && typeof e[kind] !== 'boolean') {
      problems.push({
        message: `system-category '${key}': ${kind} must be true or false, got ${JSON.stringify(e[kind])}`,
        readAs: `it is read as true, so its pages keep the ${kind === 'comments' ? 'Comments' : 'Footnotes'} tab`
      });
    }
  }
  return problems;
}
