/**
 * The one HTML policy for page content (#1623).
 *
 * Raw HTML an author writes in a page is held to one allow-list, declared once
 * in configuration (`ngdpbase.markup.html-policy`) and enforced here by one
 * parser — sanitize-html, built on htmlparser2. Save and render ask the same
 * question of the same code:
 *
 *   - render: {@link filterAuthorHtml} rewrites each piece of author HTML,
 *     keeping what the policy allows and dropping the rest. It runs inside
 *     markdown-it's `html_block` / `html_inline` renderers
 *     (src/rendering/markdownConverter.ts), so it sees author HTML and nothing
 *     else: plugin, link and variable output is merged in after markdown-it,
 *     from placeholders, and is never seen by it.
 *   - save: {@link htmlPolicyViolations} names what that rewrite would drop,
 *     and SecurityFilter refuses the save with those names.
 *
 * Why per tag, not per fragment: markdown-it hands author HTML over in pieces —
 * `<div>` and `</div>` arrive as separate tokens around the markdown between
 * them, and inline HTML arrives one tag per token. A tree sanitiser given a
 * piece balances it (`<div>` becomes `<div></div>`) and drops a close it never
 * saw opened, which would break every page that wraps markdown in HTML. So each
 * piece is split into tags and text with markdown-it's own HTML tag grammar,
 * each open tag is rebuilt by sanitize-html from its parsed attributes, a close
 * tag stays if its tag is allowed, and text is escaped.
 *
 * Why that is safe whatever the grammar's edge cases: everything not taken as
 * a tag is escaped (`<` becomes `&lt;`), so the browser cannot find a tag in it;
 * everything taken as a tag is re-serialised by sanitize-html from what
 * htmlparser2 parsed; comments, declarations and processing instructions are
 * dropped. A disagreement between the grammar and a browser can only turn
 * markup into visible text, never text into markup.
 *
 * Without a policy (no ConfigurationManager, or a malformed value) nothing an
 * author wrote is allowed: the failure is closed. The pipeline's own
 * constructs ({@link PIPELINE_HTML}) are always allowed.
 *
 * @module rendering/htmlPolicy
 */

import sanitizeHtml from 'sanitize-html';
import { HTML_TAG_RE } from 'markdown-it/lib/common/html_re.mjs';
import { enabledEntries, isPlainObject } from '../utils/configFiles.js';

/** The configuration key that declares the policy. */
export const HTML_POLICY_KEY = 'ngdpbase.markup.html-policy';

/**
 * The policy, read from configuration. There each list is a set kept as a map
 * of `name: true` (#1612), so a layer adds or removes one entry without
 * restating the rest; here it is the enabled names.
 */
export interface HtmlPolicy {
  /** Tags an author may write. */
  tags: string[];
  /** Attributes allowed per tag; `*` applies to every allowed tag. */
  attributes: Record<string, string[]>;
  /** URL schemes allowed in URL attributes (`href`, `src`, …). Relative URLs are always allowed. */
  schemes: string[];
  /** A tag's own scheme set, used instead of `schemes` for that tag (`schemes-by-tag`). */
  schemesByTag: Record<string, string[]>;
}

/**
 * HTML the render pipeline itself writes into page source before markdown-it
 * runs, so it reaches the same renderers as author HTML and must survive any
 * configured policy:
 *
 *   - `span[data-jspwiki-placeholder]` — where plugin, link and variable
 *     output is merged back after markdown-it (MarkupParser);
 *   - `span[data-md-slot]` — the same, inside style blocks;
 *   - `br[class]` — NCM's `\\` and `\\\` (`wiki-clearfix`);
 *   - the table family with `class` — pipe tables, which JSPWikiPreprocessor
 *     turns into HTML before markdown-it.
 *
 * None of these can carry script. An author writing them gets the same thing.
 */
const PIPELINE_HTML: Record<string, string[]> = {
  span: ['data-jspwiki-placeholder', 'data-md-slot'],
  br: ['class'],
  table: ['class'],
  thead: [],
  tbody: [],
  tr: [],
  th: [],
  td: []
};

/** Elements whose content is not text to a browser; dropped with a dropped tag. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noscript']);

/** A map of tag → set, each set read with {@link enabledEntries}. */
function setsByTag(value: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!isPlainObject(value)) return out;
  for (const [tag, set] of Object.entries(value)) out[tag.toLowerCase()] = enabledEntries(set).map((n) => n.toLowerCase());
  return out;
}

const policies = new WeakMap<object, HtmlPolicy>();

/**
 * The configured value of `ngdpbase.markup.html-policy` as a policy, or null
 * when it is absent or not an object — which allows no author HTML at all.
 */
export function asHtmlPolicy(value: unknown): HtmlPolicy | null {
  if (!isPlainObject(value)) return null;
  let policy = policies.get(value);
  if (!policy) {
    policy = {
      tags: enabledEntries(value.tags).map((t) => t.toLowerCase()),
      attributes: setsByTag(value.attributes),
      schemes: enabledEntries(value.schemes),
      schemesByTag: setsByTag(value['schemes-by-tag'])
    };
    policies.set(value, policy);
  }
  return policy;
}

const optionsCache = new WeakMap<HtmlPolicy, sanitizeHtml.IOptions>();
let closedOptions: sanitizeHtml.IOptions | null = null;

/** sanitize-html options for a policy plus the pipeline's own constructs. */
function optionsFor(policy: HtmlPolicy | null): sanitizeHtml.IOptions {
  const cached = policy ? optionsCache.get(policy) : closedOptions;
  if (cached) return cached;

  const attributes: Record<string, string[]> = { ...policy?.attributes };
  for (const [tag, names] of Object.entries(PIPELINE_HTML)) {
    attributes[tag] = [...(attributes[tag] ?? []), ...names];
  }
  const options: sanitizeHtml.IOptions = {
    allowedTags: [...new Set([...(policy?.tags ?? []), ...Object.keys(PIPELINE_HTML)])],
    allowedAttributes: attributes,
    allowedSchemes: policy?.schemes ?? [],
    allowedSchemesByTag: policy?.schemesByTag ?? {},
    allowProtocolRelative: true,
    disallowedTagsMode: 'discard'
  };
  if (policy) optionsCache.set(policy, options);
  else closedOptions = options;
  return options;
}

type Piece =
  | { kind: 'text'; text: string; offset: number }
  | { kind: 'open'; raw: string; name: string; offset: number }
  | { kind: 'close'; name: string; offset: number }
  | { kind: 'other'; offset: number };

// markdown-it's own grammar for "this is HTML" — the definition that decided
// these were html tokens in the first place — unanchored, to scan a fragment.
const TAG_SCAN = HTML_TAG_RE.source.replace(/^\^/, '');
const OPEN_NAME = /^<([A-Za-z][A-Za-z0-9-]*)/;
const CLOSE_NAME = /^<\/([A-Za-z][A-Za-z0-9-]*)/;

function* pieces(html: string): Generator<Piece> {
  let last = 0;
  const scan = new RegExp(TAG_SCAN, 'g'); // one per scan: a generator suspends mid-scan
  let m: RegExpExecArray | null;
  while ((m = scan.exec(html)) !== null) {
    if (m.index > last) yield { kind: 'text', text: html.slice(last, m.index), offset: last };
    const raw = m[0];
    const open = OPEN_NAME.exec(raw);
    const close = CLOSE_NAME.exec(raw);
    if (open) yield { kind: 'open', raw, name: open[1].toLowerCase(), offset: m.index };
    else if (close) yield { kind: 'close', name: close[1].toLowerCase(), offset: m.index };
    else yield { kind: 'other', offset: m.index };
    last = m.index + raw.length;
  }
  if (last < html.length) yield { kind: 'text', text: html.slice(last), offset: last };
}

/** `<`, `>` and any `&` that does not start an entity. Entities stay as written. */
function escapeText(text: string): string {
  return text
    .replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;|#[xX][0-9a-fA-F]+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * One open tag as the policy keeps it — rebuilt by sanitize-html — or '' when
 * the tag is not allowed. sanitize-html closes what it opens; only the open
 * tag is wanted, and its attribute values are escaped, so the first `>` ends it.
 */
function keepOpenTag(raw: string, options: sanitizeHtml.IOptions): string {
  const out = sanitizeHtml(raw, options);
  if (!out) return '';
  return out.slice(0, out.indexOf('>') + 1).replace(/\s*\/>$/, '>');
}

function tagAllowed(name: string, options: sanitizeHtml.IOptions): boolean {
  return Array.isArray(options.allowedTags) && options.allowedTags.includes(name);
}

/**
 * Author HTML as the policy allows it. `html` is one piece of author HTML —
 * an html_block or html_inline token's content, or a raw block's text.
 */
export function filterAuthorHtml(html: string, policy: HtmlPolicy | null): string {
  const options = optionsFor(policy);
  let out = '';
  let dropUntil: string | null = null;
  for (const piece of pieces(html)) {
    if (dropUntil) {
      if (piece.kind === 'close' && piece.name === dropUntil) dropUntil = null;
      continue;
    }
    if (piece.kind === 'text') {
      out += escapeText(piece.text);
    } else if (piece.kind === 'open') {
      const kept = keepOpenTag(piece.raw, options);
      if (kept) out += kept;
      else if (RAW_TEXT.has(piece.name) && !piece.raw.endsWith('/>')) dropUntil = piece.name;
    } else if (piece.kind === 'close') {
      if (tagAllowed(piece.name, options)) out += `</${piece.name}>`;
    }
  }
  return out;
}

/** An open tag's attributes as htmlparser2 reads them (entities decoded). */
function attributesOf(tag: string): Record<string, string> {
  let found: Record<string, string> = {};
  sanitizeHtml(tag, {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true, // only parsing here; nothing is output
    // A copy: sanitize-html filters the same object after this call.
    onOpenTag: (_name, attribs) => { found = { ...attribs }; }
  });
  return found;
}

/** One thing the policy does not allow, at an offset into the fragment. */
export interface HtmlPolicyViolation {
  message: string;
  offset: number;
}

/**
 * What {@link filterAuthorHtml} would drop from `html`, named for the author.
 * Empty when the policy allows all of it.
 */
export function htmlPolicyViolations(html: string, policy: HtmlPolicy | null): HtmlPolicyViolation[] {
  const options = optionsFor(policy);
  const allowedAttrs = options.allowedAttributes as Record<string, string[]>;
  const violations: HtmlPolicyViolation[] = [];
  for (const piece of pieces(html)) {
    if (piece.kind !== 'open') continue;
    const kept = keepOpenTag(piece.raw, options);
    if (!kept) {
      violations.push({ message: `The <${piece.name}> tag is not allowed in page content`, offset: piece.offset });
      continue;
    }
    const keptAttrs = attributesOf(kept);
    for (const [attr, value] of Object.entries(attributesOf(piece.raw))) {
      if (attr in keptAttrs) continue;
      const nameAllowed = [...(allowedAttrs[piece.name] ?? []), ...(allowedAttrs['*'] ?? [])].includes(attr);
      violations.push({
        message: nameAllowed
          ? `The URL "${value}" in ${attr} on <${piece.name}> uses a scheme that is not allowed`
          : `The ${attr} attribute on <${piece.name}> is not allowed`,
        offset: piece.offset
      });
    }
  }
  return violations;
}
