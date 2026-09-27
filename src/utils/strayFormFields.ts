/**
 * Form fields an earlier editor save wrongly stored as page frontmatter
 * (#1353): the editor's `baseLastModified` concurrency token, and the
 * `web_form_*` fields a browser extension adds at submit.
 *
 * The one statement of the rule. A save drops them (`WikiRoutes.savePage`),
 * and `scripts/strip-stray-frontmatter.ts` removes them from pages nobody
 * has saved since.
 */
export function isStrayFormField(key: string): boolean {
  return key === 'baseLastModified' || key.startsWith('web_form_');
}
