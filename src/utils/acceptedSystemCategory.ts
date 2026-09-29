/**
 * Which system-category a submitted page save is accepted with (#1504).
 *
 * `enabled: false` is visibility only (operator, 2026-09-28): a disabled
 * system-category is never offered, so nobody can choose it for a page — but a
 * page that already carries it keeps it, and saving that page is not refused.
 * Whether the save is allowed at all is policy's decision, not this one.
 *
 * @param submitted - the system-category the form or API sent
 * @param offered - the system-categories people may choose (enabled ones)
 * @param current - the page's system-category before this save, if it exists
 * @returns the accepted label, or null when the submission names a
 *   system-category the person may not choose
 */
export function acceptedSystemCategory(submitted: string, offered: string[], current?: unknown): string | null {
  const wanted = submitted.trim().toLowerCase();
  if (!wanted) return null;
  const chosen = offered.find((category) => category.toLowerCase() === wanted);
  if (chosen) return chosen;
  return typeof current === 'string' && current.toLowerCase() === wanted ? current : null;
}
