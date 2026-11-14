/**
 * Short lines or full width (#2399).
 *
 * One choice per page view. A signed-in person's own choice wins; otherwise the
 * site's setting (`ngdpbase.display.line-length`, only when an admin set it);
 * otherwise the active theme's (`lineLength` in theme.json); otherwise full.
 * The result rides on `<body data-line-length>` and CSS does the rest.
 */
export type LineLength = 'short' | 'full';

/** Site setting key. Shipped default: "full". */
export const LINE_LENGTH_SITE_KEY = 'ngdpbase.display.line-length';

/** Per-person preference key. "site" (or absent) means follow the site. */
export const LINE_LENGTH_PREF_KEY = 'display.line-length';

/** `short` or `full`; anything else (including "site") is null. */
export function asLineLength(value: unknown): LineLength | null {
  return value === 'short' || value === 'full' ? value : null;
}

export function resolveLineLength(choices: { user?: unknown; site?: unknown; theme?: unknown }): LineLength {
  return asLineLength(choices.user)
    ?? asLineLength(choices.site)
    ?? asLineLength(choices.theme)
    ?? 'full';
}
