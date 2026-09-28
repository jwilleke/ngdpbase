/**
 * Rewrite links to private pages from `private/…` to `vaults/…` (#1506).
 *
 * Old addresses are not redirected (operator, 2026-09-28), so every link a
 * page stores is rewritten once instead. Links to a private page written the
 * #1457 way, `[store/Title]`, carry no prefix and are untouched; this is for
 * the full forms a person may have written by hand:
 *
 *   - a URL path or page name:  `/private/jim/default/Diary`, `[x|private/jim/default/Diary]`
 *   - URL-encoded:              `/view/private%2Fjim%2Fdefault%2FDiary`
 *
 * Only a target naming a vault that exists is rewritten, so text that merely
 * looks like one — `/private/var/folders/…` on macOS, `private/secrets.md` —
 * is left alone. A second run writes nothing: a rewritten link no longer
 * starts with `private`.
 */

import { LEGACY_PRIVATE_ROOT, PRIVATE_URL_SEGMENT } from './privateStorePath.js';

/** The migration id, recorded per vault and for the public pages. */
export const VAULT_URL_MIGRATION = 'vault-urls';

const SEG = '[A-Za-z0-9_.-]+';
// Preceded by the start, whitespace or a character a link or URL begins after.
const PLAIN = new RegExp(`(^|[\\s(\\[|"'=<>])(/?)${LEGACY_PRIVATE_ROOT}/(${SEG})/(${SEG})/`, 'g');
const ENCODED = new RegExp(`(^|[\\s(\\[|"'=<>/])${LEGACY_PRIVATE_ROOT}%2F(${SEG})%2F(${SEG})%2F`, 'gi');

/**
 * @param content - a page's body
 * @param vaults - the vaults that exist, as `owner/store`
 * @returns the rewritten body and how many links changed
 */
export function rewriteLegacyVaultUrls(content: string, vaults: ReadonlySet<string>): { content: string; rewritten: number } {
  let rewritten = 0;
  const out = content
    .replace(PLAIN, (whole, lead: string, slash: string, owner: string, store: string) => {
      if (!vaults.has(`${owner}/${store}`)) return whole;
      rewritten++;
      return `${lead}${slash}${PRIVATE_URL_SEGMENT}/${owner}/${store}/`;
    })
    .replace(ENCODED, (whole, lead: string, owner: string, store: string) => {
      if (!vaults.has(`${owner}/${store}`)) return whole;
      rewritten++;
      return `${lead}${PRIVATE_URL_SEGMENT}%2F${owner}%2F${store}%2F`;
    });
  return { content: out, rewritten };
}
