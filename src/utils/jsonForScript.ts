/**
 * A value as JSON that is safe inside an HTML `<script>` element.
 *
 * `JSON.stringify` leaves `<` alone, so a string holding `</script>` ends the
 * script element early and whatever follows is read as HTML. Escaping `<` as
 * a `\\u003c` escape keeps the JSON identical once parsed and gives the HTML
 * parser nothing to end the element on. The two Unicode line and paragraph
 * separators (U+2028, U+2029) are escaped too: valid in JSON, they end a line
 * for older JavaScript engines.
 *
 * Views reach it as `jsonForScript` on `app.locals`, and write
 * `<%- jsonForScript(value) %>` wherever data goes into a script — never
 * `<%- JSON.stringify(value) %>` (src/__tests__/viewsCompile.test.ts fails on it).
 */

/** `<`, U+2028 and U+2029 — built from code points so no literal separator sits in this file. */
const UNSAFE_IN_SCRIPT = new RegExp(`[<${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, 'g');

export function jsonForScript(value: unknown): string {
  return (JSON.stringify(value) ?? 'null')
    .replace(UNSAFE_IN_SCRIPT, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
