import type { ActorContext } from '../context/ActorContext.js';

/**
 * What core reads from the journal add-on's `JournalDataManager` (#1868).
 *
 * Core cannot import add-on code, so the one method it calls is declared here,
 * once, matching `addons/journal/managers/JournalDataManager.ts`. Every caller
 * uses this shape — a local copy hid the change to an async, context-carrying
 * signature (#1456) and crashed /profile.
 */
export interface JournalAuthorCounter {
  /** Entries `author` wrote that `ctx` may read. */
  countByAuthor(author: string, ctx: ActorContext): Promise<number>;
}
