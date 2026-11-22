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
 *   author is an administrator.
 * - `view` and `edit` naming the same people, `admin` among them, is an
 *   Audience of those people: an Audience refuses everyone outside it every
 *   action, which is what the two lists together did. `view` alone is not
 *   exact: an Audience would also stop the people outside it changing the page,
 *   and the old limit did not.
 * - Whoever is let in still needs the site's access rules to allow the action,
 *   as on every page since the site stopped reading `access:`. The old
 *   limit's own grant is not brought back.
 * - Anything else (another action, another name, an Audience already on the
 *   page) has no exact replacement.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SECRET_DIR_MODE, SECRET_FILE_MODE } from './secretFileMode.js';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

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
  /** {@link adminsAreRoleAdmin} of the site's rules. */
  adminsAreRoleAdmin: boolean;
  /** Whether the account a page's `author` refers to holds `admin-system`; false when it cannot be told. */
  authorHoldsAdmin(author: string): Promise<boolean>;
}

/** The exact replacement for a page's `access:`. */
export interface Replacement {
  kind: 'author-lock' | 'audience';
  /** The frontmatter it sets; `access` is removed. */
  set: Record<string, unknown>;
  /** The names the new Audience lists, when it is one. */
  audience?: string[];
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
  metadata: { access?: unknown; author?: unknown; audience?: unknown } | null | undefined,
  site: SiteFacts
): Promise<Replacement | null> {
  const access = metadata?.access;
  if (!isRecord(access) || !site.adminsAreRoleAdmin) return null;
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

  if (view && edit && edit.includes('admin')) {
    const same = new Set(view).size === new Set(edit).size && view.every((n) => edit.includes(n));
    const existing = metadata?.audience;
    const hasAudience = Array.isArray(existing) ? existing.length > 0 : existing !== undefined && existing !== null && existing !== '';
    if (!same || hasAudience) return null;
    const audience = [...new Set(view)];
    return { kind: 'audience', set: { audience }, audience };
  }
  return null;
}

/** The frontmatter with `access` taken out and the replacement put in. */
export function withReplacement<T extends Record<string, unknown>>(metadata: T, replacement: Replacement): Record<string, unknown> {
  const { access: _gone, ...rest } = metadata;
  return { ...rest, ...replacement.set };
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
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'file';
  const file = path.join(folder, `${now.toISOString().replace(/[:.]/g, '-')}-${safe}`);
  fs.writeFileSync(file, text, { flag: 'wx', mode: SECRET_FILE_MODE });
  return file;
}
