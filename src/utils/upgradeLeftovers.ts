/**
 * Upgrade leftovers fixed at start (#2466): a policy rule's `priority`, and a
 * page's old `access:` limit.
 *
 * Pure, apart from the backup writer at the end. Two rules hold throughout:
 *
 * - Nothing gets wider access than before. A page's `access:` is converted only
 *   when the replacement lets in exactly the people the old limit let in, the
 *   site's administrators included; anything else is left as it is and stays in
 *   the needs-attention list for the administrator to decide.
 * - Nothing is rewritten without a copy of the file as it was.
 *
 * What "exactly" means, from how the old and the new rules read a page:
 *
 * - The old `access:` list for an action decided that action for everyone,
 *   administrators too. A page's Audience and Author Lock let every holder of
 *   `admin-system` through, whatever they name. So a replacement is exact only
 *   where the site's administrators are the `admin` role and nobody else
 *   ({@link adminsAreRoleAdmin}), and the old limit let `admin` in.
 * - `edit: [admin]` alone is an Author Lock: the page's author and
 *   administrators may change it. Exact when the page has no author, or its
 *   author is an administrator. An Author Lock only refuses; it never lets
 *   anyone in, so it cannot widen access.
 * - Nothing becomes an Audience. An Audience lets a person it names view the
 *   page outright, past the site's access rules (a deny, a condition, a role
 *   with no read), so converting a `view` list could let in someone the rules
 *   keep out today. Those pages stay in the needs-attention list.
 * - Anything else (another action, another name, a `view` list) has no exact
 *   replacement.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SECRET_DIR_MODE, SECRET_FILE_MODE } from './secretFileMode.js';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The longest piece of a name or message that goes into a log line or the admin banner. */
export const CLIP_MAX = 200;

/**
 * Text from a file or an error for a log line or the banner: line breaks and
 * other control characters become a space, and it is cut at {@link CLIP_MAX}.
 */
export function clipText(value: unknown, max: number = CLIP_MAX): string {
  const text = (typeof value === 'string' ? value : value instanceof Error ? value.message : String(value))
    // eslint-disable-next-line no-control-regex -- control characters are what is being removed
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ');
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** The name of a rule in a list: its id, or its place in the list when it has none. */
function ruleName(policy: Record<string, unknown>, index: number): string {
  return typeof policy.id === 'string' && policy.id ? policy.id : `rule ${index + 1}`;
}

/**
 * The rules with `priority` taken out (#2330: it changes nothing), and the name
 * of each rule that had one. The input is not changed; a rule without one is
 * returned as it is.
 */
export function stripPolicyPriority(policies: unknown): { policies: unknown; removed: string[] } {
  if (!Array.isArray(policies)) return { policies, removed: [] };
  const removed: string[] = [];
  const out = policies.map((p: unknown, i) => {
    if (!isRecord(p) || !Object.hasOwn(p, 'priority')) return p;
    removed.push(ruleName(p, i));
    const { priority: _gone, ...rest } = p;
    return rest;
  });
  return { policies: removed.length > 0 ? out : policies, removed };
}

/**
 * Whether the site's administrators, the people who hold `admin-system`, are
 * the `admin` role and no one else: some allow rule gives it to the `admin`
 * role, and no other allow rule that could give it names anyone but that role
 * or carries a condition. A rule that cannot be read this way makes it false,
 * so a doubt never converts a page.
 */
export function adminsAreRoleAdmin(policies: unknown): boolean {
  if (!Array.isArray(policies)) return false;
  let given = false;
  for (const p of policies) {
    if (!isRecord(p) || p.effect === 'deny') continue;
    const actions = p.actions;
    if (Array.isArray(actions) && actions.length > 0 && !actions.includes('admin-system') && !actions.includes('*')) continue;
    const subjects = p.subjects;
    const onlyAdminRole = Array.isArray(subjects) && subjects.length > 0
      && subjects.every((s) => isRecord(s) && s.type === 'role' && s.value === 'admin');
    if (!onlyAdminRole || p.condition !== undefined) return false;
    given = true;
  }
  return given;
}

/** What the conversion needs to know about the site. */
export interface SiteFacts {
  /** {@link adminsAreRoleAdmin} of the site's rules; null when the rules could not be read (they are not loaded yet). */
  adminsAreRoleAdmin: boolean | null;
  /** Whether the account a page's `author` refers to holds `admin-system`. Throws {@link CouldNotTellError} when it cannot be told, which is not a "no". */
  authorHoldsAdmin(author: string): Promise<boolean>;
}

/**
 * A fact the conversion needs could not be looked up (the user store failed,
 * the access rules are not loaded). It is not an answer of "no", so the page
 * is tried again later instead of being left as final.
 */
export class CouldNotTellError extends Error {
  constructor(what: string) {
    super(`could not tell ${what}`);
    this.name = 'CouldNotTellError';
  }
}

/**
 * An error as a log line may carry it: its class, and its code when it has
 * one. Never its message, which can hold a page title or a path.
 */
export function failureForLog(err: unknown): string {
  const code = typeof (err as { code?: unknown } | null)?.code === 'string' ? ` (${(err as { code: string }).code})` : '';
  return `${err instanceof Error ? err.name : typeof err}${code}`;
}

/** The exact replacement for a page's `access:`. */
export interface Replacement {
  kind: 'author-lock';
  /** The frontmatter it sets; `access` is removed. */
  set: Record<string, unknown>;
}

/** A non-empty list of non-empty strings, or null when it is not one. */
function names(list: unknown): string[] | null {
  return Array.isArray(list) && list.length > 0 && list.every((e) => typeof e === 'string' && e.trim() !== '') ? (list as string[]) : null;
}

/**
 * The replacement that grants exactly what the page's `access:` did, or null
 * when there is none (see the file's note on what exact means).
 */
export async function exactReplacement(
  metadata: { access?: unknown; author?: unknown } | null | undefined,
  site: SiteFacts
): Promise<Replacement | null> {
  const access = metadata?.access;
  if (!isRecord(access)) return null;
  if (site.adminsAreRoleAdmin === null) throw new CouldNotTellError('who the administrators are');
  if (!site.adminsAreRoleAdmin) return null;
  const stated = Object.entries(access).filter(([, list]) => Array.isArray(list) && list.length > 0);
  if (stated.length === 0 || stated.some(([action]) => action !== 'view' && action !== 'edit')) return null;
  const view = Array.isArray(access.view) && access.view.length > 0 ? names(access.view) : null;
  const edit = Array.isArray(access.edit) && access.edit.length > 0 ? names(access.edit) : null;
  // A list that is stated but is not plain names cannot be carried over.
  if (stated.length !== [view, edit].filter(Boolean).length) return null;

  if (!view && edit && edit.length === 1 && edit[0] === 'admin') {
    const author = metadata?.author;
    if (author !== undefined && author !== null && author !== '' && (typeof author !== 'string' || !(await site.authorHoldsAdmin(author)))) return null;
    return { kind: 'author-lock', set: { 'author-lock': true } };
  }

  return null;
}

/** The frontmatter with `access` taken out and the replacement put in. */
export function withReplacement<T extends Record<string, unknown>>(metadata: T, replacement: Replacement): Record<string, unknown> {
  const { access: _gone, ...rest } = metadata;
  return { ...rest, ...replacement.set };
}

/** The name of the record of who has had their private pages cleaned up at sign-in, in the instance data folder. */
export const SIGN_IN_DONE_FILE = 'upgrade-signin-done.json';

/**
 * The people whose private pages the sign-in clean-up has finished with (#2466),
 * from the record in `folder`. A record that is not there is an empty one.
 * A record that is there but cannot be read or understood is `null`: the
 * caller must not write the file, or the other people's entries are lost.
 */
export function readSignInDone(folder: string): Set<string> | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(folder, SIGN_IN_DONE_FILE), 'utf8');
  } catch (err) {
    return (err as { code?: unknown }).code === 'ENOENT' ? new Set() : null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    const users = isRecord(parsed) ? parsed.users : null;
    return Array.isArray(users) ? new Set(users.filter((u): u is string => typeof u === 'string')) : null;
  } catch {
    return null;
  }
}

/**
 * Write the record of who is done (#2466): the whole file to a new one beside
 * it, then renamed over the old, so a crash leaves one or the other. Throws
 * when it cannot, and the caller logs it.
 */
export function writeSignInDone(folder: string, users: ReadonlySet<string>): void {
  const file = path.join(folder, SIGN_IN_DONE_FILE);
  const next = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(next, `${JSON.stringify({ users: [...users].sort() }, null, 2)}\n`, { flag: 'wx', mode: SECRET_FILE_MODE });
    fs.renameSync(next, file);
  } catch (err) {
    fs.rmSync(next, { force: true });
    throw err;
  }
}

/**
 * Write `text` (a file as it is now) into `folder` before it is rewritten.
 * Owner-only, never overwriting. Throws when it cannot, and the caller then
 * leaves the original alone.
 *
 * @returns The path of the copy
 */
export function backUpBeforeRewrite(folder: string, name: string, text: string, now: Date = new Date()): string {
  fs.mkdirSync(folder, { recursive: true, mode: SECRET_DIR_MODE });
  // A folder that was there already keeps its own mode through mkdir; the copies can hold secrets.
  if (process.platform !== 'win32') fs.chmodSync(folder, SECRET_DIR_MODE);
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'file';
  const file = path.join(folder, `${now.toISOString().replace(/[:.]/g, '-')}-${safe}`);
  fs.writeFileSync(file, text, { flag: 'wx', mode: SECRET_FILE_MODE });
  return file;
}
