/**
 * Plugin calls and "working parts" of a page (#2389, slice 2).
 *
 * The call pattern and the parameter parser used to live inside
 * PluginSyntaxHandler. They live here so Required Pages Sync can read a page's
 * calls the way the renderer does, and the handler imports them back.
 *
 * `workingParts()` answers "what changes how this page works, as opposed to
 * what it says": plugin calls, form elements and ACL markup (all one shape,
 * `[{Name params}]`), plus behaviour-changing front-matter. A kept page is
 * flagged for review when the shipped page's working parts differ from the
 * ones recorded when the admin kept it.
 */

/**
 * The renderer's call pattern: `[{PluginName params}]`. A `[[{` prefix is the
 * escape (shown, not run). Closing tags (`[{/Name}]`) and variables
 * (`[{$name}]`) do not match, because the name is `\w+`.
 */
export const PLUGIN_CALL_SOURCE = String.raw`(?<!\[)\[\{(\w+)\s*([^}]*)\}\]`;

const PARAM_PATTERN = String.raw`([\w-]+)=(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([^\s]+))`;

/**
 * Parse `key=value` parameters the way the renderer does: single quotes,
 * double quotes, or a bare token; true, false, numbers, objects and arrays
 * are read as JSON.
 *
 * @param paramString - The text after the plugin name
 * @returns The parsed parameters
 */
export function parsePluginParameters(paramString: string): Record<string, unknown> {
  if (!paramString || !paramString.trim()) {
    return {};
  }
  const params: Record<string, unknown> = {};
  const paramRegex = new RegExp(PARAM_PATTERN, 'g');
  let match: RegExpExecArray | null;
  while ((match = paramRegex.exec(paramString)) !== null) {
    const key = match[1];
    let value = match[2] ?? match[3] ?? match[4] ?? '';
    if (match[2] || match[3]) {
      value = value.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    try {
      if (value.startsWith('{') || value.startsWith('[') || value === 'true' || value === 'false' || /^\d+(\.\d+)?$/.test(value)) {
        params[key] = JSON.parse(value);
      } else {
        params[key] = value;
      }
    } catch {
      params[key] = value;
    }
  }
  return params;
}

/** Parameters that only change how a call looks, never what it does. */
const PRESENTATION_PARAMS = new Set(['class', 'style', 'width', 'height', 'align', 'color', 'size', 'border']);

/**
 * Front-matter keys that change how a page behaves (R4 of
 * docs/design/required-pages-sync-states.md). The first ten are the ones R4
 * names. The rest are behaviour keys R4 does not name; they stay here so a
 * change to one is never passed off as wording.
 */
export const WORKING_FRONTMATTER_KEYS: string[] = [
  'system-category',
  'audience',
  'requires-setting',
  'version',
  'effective',
  'private',
  'status',
  'author-lock',
  'slug',
  'acl',
  'addon',
  'isProtected',
  'pageType',
  'draft'
];

/** Front-matter keys that only describe the page, or are bookkeeping. */
export const WORDING_FRONTMATTER_KEYS: string[] = [
  'title',
  'uuid',
  'description',
  'user-keywords',
  'userKeywords',
  // A rename adds the old title here, so a change to it alone must not ask a
  // site that kept its own copy of a shipped page to review it.
  'formerTitles',
  'system-keywords',
  'author',
  'editor',
  'created',
  'createdAt',
  'lastModified',
  'importedFrom',
  'importedAt',
  'user-modified',
  'required-source-hash',
  'addon-source-hash',
  'required-source-release',
  'addon-source-release',
  'kept-edited',
  'kept-shipped-hash',
  'kept-working-parts'
];

/** Remove fenced code blocks and inline code: what they show is not run. */
function stripCode(body: string): string {
  return body
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/(`+)[^`\n]*?\1/g, '');
}

function valueText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(valueText).sort().join(',');
  if (value !== null && typeof value === 'object') return JSON.stringify(value, Object.keys(value).sort());
  return valueText(value);
}

/**
 * The parts of a page that change how it works, as a sorted list of canonical
 * strings: `plugin:Name key="value"` for each call (parameters sorted,
 * presentation ones dropped) and `setting:key=value` for each behaviour key in
 * the front-matter.
 *
 * @param body - The page body, without front-matter
 * @param frontmatter - The page's front-matter
 * @returns The sorted working parts
 */
export function workingParts(body: string, frontmatter: Record<string, unknown> = {}): string[] {
  const parts: string[] = [];
  const re = new RegExp(PLUGIN_CALL_SOURCE, 'g');
  let match: RegExpExecArray | null;
  const text = stripCode(body);
  while ((match = re.exec(text)) !== null) {
    const name = match[1];
    const paramString = match[2] ?? '';
    const params = parsePluginParameters(paramString);
    const pairs = Object.keys(params)
      .filter((k) => !PRESENTATION_PARAMS.has(k))
      .sort()
      .map((k) => `${k}=${JSON.stringify(valueText(params[k]))}`);
    const positional = paramString.replace(new RegExp(PARAM_PATTERN, 'g'), ' ').replace(/\s+/g, ' ').trim();
    if (positional) pairs.push(`_=${JSON.stringify(positional)}`);
    parts.push(`plugin:${[name, ...pairs].join(' ')}`);
  }
  for (const key of WORKING_FRONTMATTER_KEYS) {
    if (frontmatter[key] !== undefined && frontmatter[key] !== null) {
      parts.push(`setting:${key}=${stableValue(frontmatter[key])}`);
    }
  }
  return parts.sort();
}

function showParams(rest: string): string {
  return rest.replace(/([\w-]+)=("(?:[^"\\]|\\.)*")/g, (_all, key: string, quoted: string) => {
    let value = quoted;
    try {
      value = JSON.parse(quoted) as string;
    } catch {
      /* show it as written */
    }
    return key === '_' ? value : `${key}=${value}`;
  });
}

function splitPlugin(part: string): { name: string; params: string } {
  const body = part.slice('plugin:'.length);
  const space = body.indexOf(' ');
  return space < 0 ? { name: body, params: '' } : { name: body.slice(0, space), params: showParams(body.slice(space + 1)).split(/ (?=[\w-]+=)/).join(', ') };
}

function multisetDiff(from: string[], to: string[]): { added: string[]; removed: string[] } {
  const left = [...from];
  const added: string[] = [];
  for (const item of to) {
    const at = left.indexOf(item);
    if (at >= 0) left.splice(at, 1);
    else added.push(item);
  }
  return { added, removed: left };
}

/**
 * What a call does, in words a reader of the page would use, as a verb phrase
 * in the base form ("show a page total"). Keyed by the plugin name in lower
 * case, without a trailing "plugin". A call with no entry is described by its
 * name instead.
 */
const PLAIN_CALLS: Record<string, string> = {
  totalpages: 'show a page total',
  configaccessor: 'show a site setting',
  counter: 'count things on the page',
  currenttime: 'show the date and time',
  image: 'show an image',
  index: 'list every page',
  insert: 'show another page inside it',
  location: 'show a map location',
  recentchanges: 'list recent changes',
  search: 'add a search box',
  sessions: 'show who is signed in',
  slideshow: 'show a slideshow',
  pageslideshow: 'show a slideshow',
  undefinedpages: 'list pages that are linked to but do not exist',
  uptime: 'show how long the site has been running',
  media: 'show media',
  referringpages: 'list the pages that link to it',
  comments: 'show comments',
  marquee: 'show scrolling text',
  attach: 'show attachments',
  attachments: 'show attachments',
  footnotes: 'list footnotes',
  variables: 'show site variables',
  tabs: 'show tabs',
  tab: 'show tabs',
  table: 'number table rows'
};

/** "show a page total" to "shows a page total". */
function thirdPerson(phrase: string): string {
  const space = phrase.indexOf(' ');
  return space < 0 ? `${phrase}s` : `${phrase.slice(0, space)}s${phrase.slice(space)}`;
}

function plainCall(part: string, direction: 'added' | 'removed'): string {
  const { name, params } = splitPlugin(part);
  const phrase = PLAIN_CALLS[name.toLowerCase().replace(/plugin$/, '')];
  if (phrase) return direction === 'added' ? `The shipped page now ${thirdPerson(phrase)}.` : `The shipped page no longer ${thirdPerson(phrase)}.`;
  const shown = params ? `${name} (${params})` : name;
  return direction === 'added' ? `The shipped page now adds ${shown}.` : `The shipped page no longer adds ${shown}.`;
}

/**
 * Plain sentences for what differs between two working-part lists.
 *
 * @param before - The parts recorded when the page was kept
 * @param after - The parts of the shipped page now
 * @returns One sentence per difference; empty when the lists match
 */
export function describeWorkingChanges(before: string[], after: string[]): string[] {
  const { added, removed } = multisetDiff(before, after);
  const sentences: string[] = [];
  const settingKey = (p: string): string => p.slice('setting:'.length).split('=')[0];
  const settingValue = (p: string): string => p.slice('setting:'.length).split('=').slice(1).join('=');
  const removedSettings = new Map(removed.filter((p) => p.startsWith('setting:')).map((p) => [settingKey(p), p]));

  for (const part of added) {
    if (part.startsWith('plugin:')) {
      sentences.push(plainCall(part, 'added'));
    } else {
      const key = settingKey(part);
      const old = removedSettings.get(key);
      if (old) {
        removedSettings.delete(key);
        sentences.push(`The setting "${key}" is now ${settingValue(part)} (it was ${settingValue(old)}).`);
      } else {
        sentences.push(`The setting "${key}" is now ${settingValue(part)}.`);
      }
    }
  }
  for (const part of removed) {
    if (part.startsWith('plugin:')) {
      sentences.push(plainCall(part, 'removed'));
    } else if (removedSettings.has(settingKey(part))) {
      sentences.push(`The setting "${settingKey(part)}" is no longer set.`);
    }
  }
  return sentences;
}
