/**
 * Legacy JSPWiki ACL markup, scrubbed from page text (#1431 step 8).
 *
 * `[{ALLOW edit Charlie}]`, `[{DENY …}]`, `%%acl … %%` and `(:acl … :)` were
 * access rules written in a page's BODY. Nothing reads them as rules any more
 * (#1431 7a): access is audience terms in frontmatter, and an imported page's
 * ACL is converted to those by the NCM funnel (#1446). What is left is text
 * that means nothing, so the editor removes it when a page is opened for
 * editing, and a re-save drops it for good.
 *
 * This is text handling, not access control, which is why it lives with the
 * parsers rather than in the PolicyInformationPoint (it was
 * `ACLManager.removeACLMarkup`).
 *
 * __An escaped example is prose, and is left alone.__ `[[{ALLOW edit Charlie}]`
 * is how a page DOCUMENTS the syntax. The old pattern matched the inner
 * `[{ALLOW edit Charlie}]` anyway, so opening such a page for editing turned
 * the example into a stray `[` and saving it lost the text. On the instance
 * measured, the one live page carrying the markup was exactly that: an
 * imported documentation page about `jspwiki.properties`. The same rule as the
 * NCM converter's (#1446): a `[` in front means it is being quoted.
 */

const PLUGIN = /(?<!\[)\[\{\s*(ALLOW|DENY)\b[^}]*\}\]/gim;
const PERCENT_BLOCK = /%%acl[\s\S]*?%%/gim;
const DIRECTIVE = /\(:\s*acl\b[^:]*:\)/gim;

/** The page text with legacy ACL markup removed and escaped examples kept. */
export function stripAclMarkup(content: string): string {
  if (typeof content !== 'string' || !content) return content;
  return content.replace(PLUGIN, '').replace(PERCENT_BLOCK, '').replace(DIRECTIVE, '');
}
