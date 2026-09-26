/**
 * The opener of a block-form `%%` style block, on its own line (#1345).
 *
 * One or more class names, separated by spaces or dots — `%%information`,
 * `%%btn btn-sm`, `%%size-20.bg-silver`. A dot is a class separator, as in
 * the inline form (`%%btn.btn-info … /%`) and in Apache JSPWiki
 * (`JSPWikiMarkupParser.handleDiv`). Shared by the markup parser's
 * extraction and the JSPWiki preprocessor, which each had their own copy and
 * had drifted: neither accepted a dot, and the preprocessor accepted only one
 * class.
 */
export const STYLE_BLOCK_OPENER = /^\s*%%([a-zA-Z0-9_-]+(?:[ \t.]+[a-zA-Z0-9_-]+)*)[ \t]*$/;

/** The class attribute for an opener's captured names: dots and runs of spaces become one space. */
export function styleBlockClasses(captured: string): string {
  return captured.replace(/[ \t.]+/g, ' ');
}
