/**
 * redactPrivateNames — keep private page titles out of logs and the audit
 * trail (#1461, epic #1454).
 *
 * A private page is named by its path, `private/{owner}/{store}/{title}`
 * (#1456). Its title belongs to its owner's store; nobody else — admin
 * included — may read it, and `/admin/logs` and the audit view are read by
 * admins. So wherever such a name reaches a log line or an audit event, the
 * title is struck and the owner and store are kept: the line stays
 * diagnosable ("a page in molly's default store") without saying which page.
 *
 * Three shapes are recognised, because a name reaches a line in all three:
 *
 *   - as written:     `private/molly/default/Merger notes`
 *   - in a URL path:  `/private/molly/default/Merger%20notes/edit`
 *   - URL-encoded:    `private%2Fmolly%2Fdefault%2FMerger%20notes`
 *
 * A bare title — `Loaded MergerNotes from …` — cannot be told from any other
 * word, so the code that knows a page is private logs its uuid instead. This
 * catches every line that names the page the way the rest of the system does.
 *
 * Like redactSecrets, this module never imports the logger (bootstrap cycle).
 */
import { format } from 'winston';
import type { Logform } from 'winston';

/** What a struck title is replaced with. */
export const REDACTED_TITLE = '[redacted]';

/** A page file, index or store folder under a store — a path, not a title. */
const STORE_FILE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.\w+)?|[\w-]+\.json)$/i;

const keep = (title: string): boolean => STORE_FILE.test(title);

// URL-encoded: private%2F{owner}%2F{store}%2F{title}
const ENCODED = /private%2F([^%\s/?#&"']+)%2F([^%\s/?#&"']+)%2F([^\s/?#&"']+)/gi;
// A URL path: /private/{owner}/{store}/{title}, the title one path segment.
const URL_PATH = /(\/private\/[^/\s?#'"]+\/[^/\s?#'"]+\/)([^/\s?#'"]+)/g;
// As written: the title runs to the end of the line, a quote, or where the
// next `key=` field, `)` or `]` begins. A title containing one of those loses
// only what follows it — over- rather than under-redaction is not possible
// without knowing the title, so the boundary is kept deliberately wide.
const PLAIN = /(^|[^/\w%])(private\/[^/\s'"]+\/[^/\s'"]+\/)(.+?)(?=$|\n|"|'(?=[\s,.;:)\]]|$)|\s[\w.-]+=|\)|\])/gm;

/**
 * Strike the title from every private page name in `text`.
 *
 * @param text - a log line, message or audit field
 * @returns the text with each private title replaced by `[redacted]`
 */
export function redactPrivateNames(text: string): string {
  if (typeof text !== 'string' || !/private(?:\/|%2F)/i.test(text)) return text;
  return text
    .replace(ENCODED, (whole, owner: string, store: string, title: string) =>
      (keep(title) ? whole : `private%2F${owner}%2F${store}%2F${REDACTED_TITLE}`))
    .replace(URL_PATH, (whole, prefix: string, title: string) =>
      (keep(title) || title === REDACTED_TITLE ? whole : `${prefix}${REDACTED_TITLE}`))
    .replace(PLAIN, (whole, lead: string, prefix: string, title: string) =>
      (keep(title) || title.startsWith('[redacted') ? whole : `${lead}${prefix}${REDACTED_TITLE}`));
}

/**
 * The same, over every string in a value — an audit event's fields,
 * metadata and context. Other values are returned as they are.
 */
export function redactPrivateNamesDeep<T>(value: T): T {
  if (typeof value === 'string') return redactPrivateNames(value) as T;
  if (Array.isArray(value)) return value.map(redactPrivateNamesDeep) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactPrivateNamesDeep(v);
    return out as T;
  }
  return value;
}

/**
 * Winston format striking private titles from the message, any stack, and
 * the metadata a line carries (`logger.info(msg, { pageName })`). Placed
 * before `printf`, beside redactSecretsFormat, so every transport gets it.
 */
export function redactPrivateNamesFormat(): Logform.Format {
  return format((info) => {
    for (const key of Object.keys(info)) {
      if (key === 'level' || key === 'timestamp') continue;
      info[key] = redactPrivateNamesDeep(info[key]);
    }
    return info;
  })();
}
