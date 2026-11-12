/**
 * A save refused because another public page already has the title (#2371),
 * or a name whose slug is the same as that page's (#2376).
 *
 * The message keeps the other page's id, for the log. What the reader sees is
 * {@link pageTitleConflictText} and the link in {@link pageTitleConflictLink}:
 * the title, never the id. A private-store clash is a plain Error that names
 * nothing (#1461), so it is not this class.
 */

import { pageUrl } from './pageUrl.js';

/** The page that has the name, as the error page and the editor's JSON carry it. */
export interface ConflictingPage {
  title: string;
  url: string;
  /** Only the slugs match: the view says the name is too close, not taken. */
  tooClose?: boolean;
}

export class PageTitleConflictError extends Error {
  readonly code = 'page-title-conflict';
  /**
   * @param title the title of the page that already has it
   * @param pageId that page's id, for the message only
   * @param requested the title the save asked for, when it differs only by case
   * @param tooClose the titles differ and only their slugs match
   */
  constructor(readonly title: string, pageId: string, requested: string = title, readonly tooClose = false) {
    super(tooClose
      ? `Title "${requested}" has the same slug as page ${pageId} ("${title}")`
      : `Title "${requested}" is already in use by page ${pageId}`);
    this.name = 'PageTitleConflictError';
  }
}

/** What the reader is told. */
export function pageTitleConflictText(err: PageTitleConflictError): string {
  if (err.tooClose) return `That name is too close to the name of an existing page, "${err.title}".`;
  return `A page called "${err.title}" already exists.`;
}

/** Where the title links to: the other page's title and its `/view/…` URL. */
export function pageTitleConflictLink(err: PageTitleConflictError): ConflictingPage {
  return { title: err.title, url: pageUrl(err.title), ...(err.tooClose && { tooClose: true }) };
}
