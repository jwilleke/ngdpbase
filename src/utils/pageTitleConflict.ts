/**
 * A save refused because another public page already has the title (#2371).
 *
 * The message keeps the other page's id, for the log. What the reader sees is
 * {@link pageTitleConflictText} and the link in {@link pageTitleConflictLink}:
 * the title, never the id. A private-store clash is a plain Error that names
 * nothing (#1461), so it is not this class.
 */

import { pageUrl } from './pageUrl.js';

export class PageTitleConflictError extends Error {
  readonly code = 'page-title-conflict';
  /**
   * @param title the title of the page that already has it
   * @param pageId that page's id, for the message only
   * @param requested the title the save asked for, when it differs only by case
   */
  constructor(readonly title: string, pageId: string, requested: string = title) {
    super(`Title "${requested}" is already in use by page ${pageId}`);
    this.name = 'PageTitleConflictError';
  }
}

/** What the reader is told. */
export function pageTitleConflictText(err: PageTitleConflictError): string {
  return `A page called "${err.title}" already exists.`;
}

/** Where the title links to: the other page's title and its `/view/…` URL. */
export function pageTitleConflictLink(err: PageTitleConflictError): { title: string; url: string } {
  return { title: err.title, url: pageUrl(err.title) };
}
