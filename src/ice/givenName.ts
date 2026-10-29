/**
 * The name a user gives what an upload becomes (#2130): a page's title, a
 * file's name. One rule, used by the import screen's route (to answer the
 * user at once) and by the engine (which trusts no caller, #2013).
 *
 * A receiver that applies a given name says which form it takes
 * (`IceReceiver.names`); one that names things itself declares none and is
 * never handed a name. The name chooses no location and no path: it is
 * checked here as a name only, and the receiver's own door decides where
 * the thing goes, as it does without one.
 */
import path from 'node:path';
import { TITLE_RULE_MESSAGE, titleBreaksRule } from '../utils/pageTitleRule.js';

/** What a receiver names: a page's `title`, or a `file`'s name (whose extension stays the upload's own). */
export type IceNameForm = 'title' | 'file';

/** Control characters (C0, DEL, C1): never in a name. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * What the screen pre-fills for this file, and what counts as "kept as it
 * is": a file's own name, or for a title, the file's name without its
 * extension.
 */
export function defaultGivenName(form: IceNameForm, original: string): string {
  const base = path.basename(original);
  return form === 'title' ? path.basename(base, path.extname(base)) : base;
}

/**
 * Why this name cannot be used, or null when it can. `given` is trimmed
 * first. `original` is the uploaded file's own name.
 */
export function givenNameProblem(form: IceNameForm, given: string, original: string, maxLength: number): string | null {
  const name = given.trim();
  if (!name) return 'Give it a name, or keep the file\'s own.';
  if (name.length > maxLength) return `A name can be up to ${maxLength} characters.`;
  if (CONTROL.test(name)) return 'A name cannot contain control characters.';
  if (form === 'title') return titleBreaksRule(name) ? TITLE_RULE_MESSAGE : null;
  if (/[/\\]/.test(name)) return 'A file name cannot contain / or \\.';
  if (name.startsWith('.')) return 'A file name cannot start with a dot.';
  const ext = path.extname(path.basename(original)).toLowerCase();
  if (path.extname(name).toLowerCase() !== ext) {
    return ext ? `Keep the file's extension, ${ext}.` : 'This file has no extension; the name cannot add one.';
  }
  return null;
}

/**
 * The given name the engine applies: trimmed, or none when it is the
 * default (the user kept the file's own name), so a receiver names it as it
 * always has (a page's title from its content, else its file name).
 */
export function appliedGivenName(form: IceNameForm, given: string, original: string): string | undefined {
  const name = given.trim();
  return name && name !== defaultGivenName(form, original) ? name : undefined;
}
