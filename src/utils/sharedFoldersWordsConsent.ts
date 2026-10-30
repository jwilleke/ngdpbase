/**
 * "I have saved the shared folders' recovery words" (#2124, epic #1775
 * decision 4): whose confirmation counts and whether it is still to come.
 *
 * The organization has one set of 12 recovery words for its shared folders
 * (SharedFolderManager). They are shown once, to the admin who made them, and
 * only that admin's confirmation means anything: nobody else saw the words.
 * So the confirmation asked for is theirs, in the consent scope
 * `shared-folders-recovery-words`, bound to the set of words (`wordsId`): a
 * new set asks again, and so does a new version of the wording. Until it is
 * recorded, holders of `admin-system` see a banner
 * (`middleware/recoveryWordsNotice.ts`); it never holds anything.
 */
import { SHARED_FOLDERS_WORDS_CONSENT_SCOPE, type ConsentDocument } from '../types/Consent.js';
import type { SharedFoldersWordsInfo } from '../managers/SharedFolderManager.js';

type EngineLike = { getManager: (name: string) => unknown };

/** The organization's recovery words and what their admin is still to confirm about them. */
export interface SharedFoldersWordsState extends SharedFoldersWordsInfo {
  /** The document at its current version when `shownTo` has not confirmed it for this set; empty when they have. */
  pending: ConsentDocument[];
}

/** The organization's recovery words and whether their admin confirmed saving them, or null: none made yet. */
export async function sharedFoldersWordsState(engine: EngineLike): Promise<SharedFoldersWordsState | null> {
  const folders = engine.getManager('SharedFolderManager') as { recoveryWordsInfo?(): SharedFoldersWordsInfo | null } | null;
  const info = folders?.recoveryWordsInfo?.() ?? null;
  if (!info) return null;
  const consent = engine.getManager('ConsentManager') as { pendingFor?(u: string, s: string, subject?: string): Promise<ConsentDocument[]> } | null;
  const pending = (await consent?.pendingFor?.(info.shownTo, SHARED_FOLDERS_WORDS_CONSENT_SCOPE, info.wordsId)) ?? [];
  return { ...info, pending };
}

/** What the banner says: to the admin who was shown the words, or to another admin, about them. */
export function sharedFoldersWordsMessage(state: SharedFoldersWordsInfo, viewer: string): string {
  const stake = 'If the shared-folders key is ever lost, the organization\'s 12 recovery words are the only way to open its shared folders again.';
  return viewer === state.shownTo
    ? `${stake} You were shown them once; confirm you have saved them off this server.`
    : `${stake} ${state.shownTo} was shown them and has not confirmed saving them yet.` +
      (state.protectsFolders
        ? ' If they cannot, make a new set on Admin → Backup and confirm it yourself.'
        : ' If they cannot, discard this set on Admin → Backup and make a new one, then confirm it yourself.');
}
