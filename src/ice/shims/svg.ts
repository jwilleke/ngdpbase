/**
 * svg shim (#2149): cleans an SVG before it is kept as a file. An SVG is a
 * document, not a picture: it can carry `<script>`, HTML inside
 * `<foreignObject>`, `on…` event handlers and `javascript:` links. Each is
 * removed, and the note says what and how many, never the content.
 *
 * Defence in depth, not the boundary: an uploaded file is always served
 * sandboxed (`untrustedFileHeaders`, #1624), so nothing in it runs as the
 * site. Cleaning keeps a file that is downloaded, embedded elsewhere or
 * opened outside the site from carrying it.
 *
 * A vetting shim only (`clean`, no `read`): never picked for an import run.
 */

import type { IceShim, IceWarning } from '../types.js';

/** `<script>` and `<foreignObject>` (any namespace prefix), self-closed, closed, or left open to the end. */
const ACTIVE_ELEMENT = /<((?:[\w-]+:)?(script|foreignobject))\b(?:"[^"]*"|'[^']*'|[^'">])*?(?:\/>|>[\s\S]*?(?:<\/\1\s*>|$))/gi;

/** A start tag, with quoted attribute values that may hold `>`. */
const START_TAG = /<[A-Za-z][^\s/>]*(?:"[^"]*"|'[^']*'|[^'">])*>/g;

/** One attribute inside a start tag: its leading space, name and optional value. */
const ATTRIBUTE = /(\s+)([^\s=/>"']+)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/g;

/** A link that runs script, once entities, quotes and white space are taken out. */
const SCRIPT_LINK = /^(?:javascript|vbscript):/i;

function decodedValue(raw: string): string {
  const value = raw.replace(/^\s*=\s*/, '').replace(/^["']|["']$/g, '');
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;|&newline;/gi, '')
    // eslint-disable-next-line no-control-regex -- control characters a browser ignores inside a URL scheme
    .replace(/[\s\u0000-\u001f]+/g, '');
}

/** The cleaned text and what was removed: the pure step behind the shim. */
export function cleanSvgText(text: string): { text: string; removed: IceWarning[] } {
  let scripts = 0;
  let foreign = 0;
  let handlers = 0;
  let links = 0;
  let out = text.replace(ACTIVE_ELEMENT, (_whole, _qualified: string, local: string) => {
    if (local.toLowerCase() === 'script') scripts++;
    else foreign++;
    return '';
  });
  out = out.replace(START_TAG, (tag) => tag.replace(ATTRIBUTE, (attr, _space: string, name: string, value: string | undefined) => {
    if (/^on/i.test(name)) {
      handlers++;
      return '';
    }
    if (value !== undefined && SCRIPT_LINK.test(decodedValue(value))) {
      links++;
      return '';
    }
    return attr;
  }));
  const removed: IceWarning[] = [];
  if (scripts) removed.push({ kind: 'svg-script', detail: `removed ${scripts} script element${scripts === 1 ? '' : 's'}` });
  if (foreign) removed.push({ kind: 'svg-foreign-object', detail: `removed ${foreign} block${foreign === 1 ? '' : 's'} of embedded HTML (foreignObject)` });
  if (handlers) removed.push({ kind: 'svg-handler', detail: `removed ${handlers} event handler${handlers === 1 ? '' : 's'} (on… attributes)` });
  if (links) removed.push({ kind: 'svg-script-link', detail: `removed ${links} script link${links === 1 ? '' : 's'} (javascript:)` });
  return { text: out, removed };
}

export const svgShim: IceShim = {
  name: 'svg',
  label: 'SVG',
  direction: 'in',
  accepts: { extensions: ['.svg'], mediaTypes: ['image/svg+xml'] },
  produces: 'file',
  receivers: [],

  async clean(input) {
    const original = input.bytes ?? Buffer.from(input.text ?? '', 'utf8');
    const { text, removed } = cleanSvgText(original.toString('utf8'));
    return { bytes: removed.length > 0 ? Buffer.from(text, 'utf8') : original, removed };
  }
};
