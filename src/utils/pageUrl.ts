/**
 * The URL of a page, and of an action on it (#1456, epic #1454).
 *
 * `/view/…` serves public pages only. A private page, named
 * `private/{owner}/{store}/{title}`, lives at `/private/{owner}/{store}/{title}`,
 * and every action on it lives under that path. This is the one place that
 * turns a page name into a link, so routes, views and redirects agree.
 * It holds no data and reads no config.
 */

import { parsePrivatePageName } from './privateStorePath.js';

/** The page actions that have a URL of their own. */
export type PageAction = 'view' | 'edit' | 'save' | 'delete' | 'history' | 'diff';

/**
 * The URL for `action` on the page named `pageName`.
 *
 * @example pageUrl('Main') === '/view/Main'
 * @example pageUrl('private/jim/default/Diary', 'edit') === '/private/jim/default/Diary/edit'
 */
export function pageUrl(pageName: string, action: PageAction = 'view'): string {
  const name = parsePrivatePageName(pageName);
  if (!name) return `/${action}/${encodeURIComponent(pageName)}`;
  const base = ['', 'private', name.owner, name.store, name.title].map(encodeURIComponent).join('/');
  return action === 'view' ? base : `${base}/${action}`;
}
