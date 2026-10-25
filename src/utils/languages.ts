/**
 * Language names and tags for an identity record's `knowsLanguage` (#2073).
 * The names are the runtime's own (`Intl.DisplayNames`), so no list is kept
 * here: every two-letter ISO 639-1 code the runtime can name.
 */

let byKey: Map<string, string> | null = null;
let names: Intl.DisplayNames | null = null;

function displayNames(): Intl.DisplayNames {
  names ??= new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
  return names;
}

function index(): Map<string, string> {
  if (byKey) return byKey;
  byKey = new Map();
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (const a of letters) {
    for (const b of letters) {
      const tag = a + b;
      const name = displayNames().of(tag);
      if (!name) continue;
      byKey.set(tag, tag);
      byKey.set(name.toLowerCase(), tag);
    }
  }
  return byKey;
}

/** The tag for a language given by name ("Spanish") or tag ("es"), ignoring case; null when unknown. */
export function languageTag(given: string): string | null {
  return index().get(given.trim().toLowerCase()) ?? null;
}

/** A stored tag as a name ("es" → "Spanish"); the tag itself when the runtime has no name for it. */
export function languageName(tag: string): string {
  try {
    return displayNames().of(tag) ?? tag;
  } catch {
    return tag;
  }
}
