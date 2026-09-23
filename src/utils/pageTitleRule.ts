/**
 * What a page title may contain (#1455).
 *
 * Declared once, applied at the `PageManager` save door, so every writer meets
 * it: the editor, the NCM funnel (import, MCP, paste, convert, ingest), addons
 * and scripts. It used to be written out three times in `WikiRoutes`, which is
 * why the paths that do not go through a route — an import, an agent write —
 * could put a title on disk that the editor would have refused.
 *
 * The characters are refused for three separate reasons, and each one is a
 * defect somebody met:
 *
 *   - `/` breaks `/view/:page` routing, and `[store/Title]` — a private page's
 *     link — can only be read if no title contains one (#1457).
 *   - `\ # ? % " < > | *` break URLs, YAML frontmatter or file names.
 *
 * A private page's NAME is a path, `private/{owner}/{store}/{title}` (#1456).
 * The rule is about the title, never the name.
 */

/** The characters a page title may not contain. */
export const FORBIDDEN_TITLE_CHARS = /[/\\#?%"<>|*]/;

/** What a person is told when a title is refused — the editor's message. */
export const TITLE_RULE_MESSAGE =
  'Page title contains invalid characters. The following are not allowed: / \\ # ? % " < > | *';

/** True when `title` breaks the rule. */
export function titleBreaksRule(title: string): boolean {
  return FORBIDDEN_TITLE_CHARS.test(title);
}

/**
 * The same title with the forbidden characters replaced by `-`, for the NCM
 * funnel, which converts someone else's data and must not drop a page over a
 * character (operator, 2026-09-23: normalise and report). Runs of `-` collapse
 * and the ends are trimmed, so `Docs/Setup` reads as `Docs-Setup` rather than
 * `Docs--Setup-`.
 *
 * A caller that normalises says so in its report and records what the source
 * called the page; the editor never normalises, because a person typing a
 * title can simply be told.
 */
export function normaliseTitle(title: string): string {
  return title
    .replace(/[/\\#?%"<>|*]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}
