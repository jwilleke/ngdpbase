/**
 * NCM footnote capture (#1125) — the pure half.
 *
 * GFM and NCM share the `[^id]` / `[^id]: text` syntax, and the render
 * pipeline already links refs inline. What the sidecar footnote list
 * (FootnoteManager + FootnotesPlugin, the one with the CRUD UI) needs is the
 * DEFINITIONS as structured records. This module extracts them and rewrites
 * the body; it is deliberately side-effect free so §3.1 determinism holds —
 * the sidecar write belongs to the caller (the convert route), exactly as
 * image localization splits pure rewrite from attachment persistence.
 *
 * Ids are preserved verbatim — the body's `[^note-1]` refs must keep
 * resolving to `#footnote-note-1` in the rendered list, so renumbering would
 * break every ref it touched.
 */

export interface ExtractedFootnoteDef {
  id: string;
  display: string;
  url: string;
  note: string;
}

export interface FootnoteExtraction {
  defs: ExtractedFootnoteDef[];
  /** Body with the definition lines removed. Byte-identical input when there are none. */
  content: string;
}

/** `[^id]: text` at line start. Id: no whitespace or `]`, same as the render pipeline. */
const DEF_LINE = /^\[\^([^\]\s]+)\]:\s*(.*)$/;
/** GFM continuation: at least four spaces or a tab of indent. */
const CONTINUATION = /^(?: {4,}|\t)(.*)$/;
/** Definition text that is exactly a markdown link. */
const MD_LINK_ONLY = /^\[([^\]]+)\]\((https?:[^)\s]+)\)$/;
/**
 * Definition text that is exactly an NCM/JSPWiki external link —
 * `[Display|https://url|target="_blank"]`. The link normalizer runs before
 * footnote extraction in the convert pipeline, so a markdown-link definition
 * arrives here already in this form.
 */
const NCM_LINK_ONLY = /^\[([^|\]]+)\|(https?:[^|\]\s]+)(?:\|[^\]]*)?\]$/;
/** Definition text that is exactly a bare URL. */
const BARE_URL_ONLY = /^https?:\/\/\S+$/;

function toRecord(id: string, text: string): ExtractedFootnoteDef {
  const trimmed = text.trim();
  const asLink = trimmed.match(MD_LINK_ONLY) ?? trimmed.match(NCM_LINK_ONLY);
  if (asLink) return { id, display: asLink[1], url: asLink[2], note: '' };
  if (BARE_URL_ONLY.test(trimmed)) return { id, display: '', url: trimmed, note: '' };
  return { id, display: '', url: '', note: trimmed };
}

/**
 * Pull every footnote definition (single-line and GFM multi-paragraph) out of
 * the body. Continuation lines — indented by 4+ spaces or a tab, with blank
 * lines allowed between paragraphs of the same definition — join the note
 * with newlines.
 */
export function extractFootnoteDefs(content: string): FootnoteExtraction {
  // Defensive: \r is a JS regex LineTerminator, so `.` and `$` silently
  // refuse a line ending in \r. The NCM normalizer canonicalizes to LF
  // upstream; this guards direct callers handing us CRLF anyway. When
  // nothing matches, the ORIGINAL content is returned byte-identical.
  const hadCr = content.includes('\r');
  const lines = (hadCr ? content.replace(/\r\n?/g, '\n') : content).split('\n');
  const defs: ExtractedFootnoteDef[] = [];
  const kept: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const def = lines[i].match(DEF_LINE);
    if (!def) {
      kept.push(lines[i]);
      continue;
    }
    const parts: string[] = def[2].trim() ? [def[2].trim()] : [];
    // Consume continuations: indented lines, with blank lines allowed only
    // when another indented line follows (otherwise the blank ends the def).
    let j = i + 1;
    while (j < lines.length) {
      const cont = lines[j].match(CONTINUATION);
      if (cont) {
        parts.push(cont[1].trim());
        j++;
        continue;
      }
      if (lines[j].trim() === '' && j + 1 < lines.length && CONTINUATION.test(lines[j + 1])) {
        j++;
        continue;
      }
      break;
    }
    defs.push(toRecord(def[1], parts.join('\n')));
    // Swallow one trailing blank line so removing the def doesn't leave a
    // doubled gap where it stood.
    i = j < lines.length && lines[j].trim() === '' ? j : j - 1;
  }

  return defs.length === 0
    ? { defs, content }
    : { defs, content: kept.join('\n') };
}

/** Matches any [{FootnotesPlugin …}] invocation, parameterised or bare. */
const PLUGIN_RE = /\[\{FootnotesPlugin(\s[^}]*)?\}\]/;

/**
 * Append a footnote-list section when the page has none, so transferred
 * definitions stay visible. Idempotent: an existing invocation — with or
 * without parameters — is left untouched.
 */
export function ensureFootnotesPlugin(content: string): string {
  if (PLUGIN_RE.test(content)) return content;
  return `${content.replace(/\s*$/, '')}\n\n[{FootnotesPlugin}]\n`;
}
