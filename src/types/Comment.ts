export interface PageComment {
  id: string;
  pageUuid: string;
  /** Who wrote it: their identity `@id` (#2041); a username on a comment written before and not yet converted (a vault page's), or one with no account. */
  author: string;
  authorDisplayName: string;
  content: string;
  createdAt: string;
  deleted?: boolean;
  deletedBy?: string;
  deletedAt?: string;
}
