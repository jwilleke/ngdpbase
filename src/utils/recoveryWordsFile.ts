/**
 * Recovery words to keep (#2144): the sheet an admin or a user downloads as a
 * file or prints while their new words still wait to be confirmed, and the
 * audit record of handing them out.
 *
 * One sheet for both sets of words: the shared folders' (SharedFolderManager)
 * and a user's vault key (the store door, `privateStoreDoor.ts`). The words
 * come only from the set still held for confirmation; once confirmed they are
 * gone from the server and cannot be made again, so nothing here stores,
 * caches or logs them. No key material is on the sheet.
 */
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import { recordAuditEvent, type AuditEventSink } from './auditEvents.js';
import { AUDIT_EVENT } from './auditEventNames.js';

/** Whose words: the organization's shared folders', or a user's vault key. */
export type RecoveryWordsSet = 'shared-folders' | 'store';

/** How they left the page: a plain text file, or the print view. */
export type RecoveryWordsExport = 'download' | 'print';

/** What each set of words is for, in one line, as the sheet says it. */
const PURPOSE: Record<RecoveryWordsSet, string> = {
  'shared-folders': 'These 12 words open the organization\'s shared folders on this site if its shared-folders key is ever lost. Without the key and these words, the shared folders are lost for good.',
  store: 'These 12 words open your encrypted vaults on this site if you forget your password. Without your password and these words, the files in them are lost for good.'
};

const NOT_STORED = 'They are not stored on the server: keep this copy off the server, somewhere safe, and never send it to anyone.';

/** Everything the sheet shows, for the text file and the print view alike. */
export interface RecoveryWordsSheet {
  title: string;
  siteName: string;
  siteUrl: string;
  /** When the words were made, in the server's local time with its offset. */
  made: string;
  words: readonly string[];
  purpose: string;
  notStored: string;
}

/** `date` in the server's local time: `2026-10-30 05:28 (UTC-04:00)`. */
export function serverLocalTime(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} (UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)})`;
}

/** The sheet for `words` of `set`, made at `madeAt`, on the site named `siteName` at `siteUrl`. */
export function recoveryWordsSheet(args: { set: RecoveryWordsSet; siteName: string; siteUrl: string; words: readonly string[]; madeAt: Date }): RecoveryWordsSheet {
  const siteName = args.siteName || args.siteUrl;
  return {
    title: args.set === 'shared-folders' ? `${siteName}: shared folders' recovery words` : `${siteName}: your recovery words`,
    siteName,
    siteUrl: args.siteUrl,
    made: serverLocalTime(args.madeAt),
    words: args.words,
    purpose: PURPOSE[args.set],
    notStored: NOT_STORED
  };
}

/** The sheet as a plain text file: the site, when made, the numbered words, what they are for. */
export function recoveryWordsText(sheet: RecoveryWordsSheet): string {
  return [
    sheet.title,
    '',
    `Site: ${sheet.siteName} (${sheet.siteUrl})`,
    `Made: ${sheet.made}`,
    '',
    ...sheet.words.map((w, i) => `${String(i + 1).padStart(2, ' ')}. ${w}`),
    '',
    sheet.purpose,
    sheet.notStored,
    ''
  ].join('\n');
}

/** The file name: the site's name and whose words, safe for any file system. */
export function recoveryWordsFilename(siteName: string, set: RecoveryWordsSet): string {
  const stem = siteName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '') || 'ngdpbase';
  return `${stem}-${set === 'shared-folders' ? 'shared-folders-' : ''}recovery-words.txt`;
}

/**
 * Record that `ctx` downloaded or opened to print the set `wordsId` of `set`
 * (`recovery-words-export`, on-failure refuse): called before the words are
 * sent, so a record that cannot be written sends nothing. Who, which set and
 * how; never the words.
 */
export async function recordRecoveryWordsExport(
  sink: AuditEventSink | null | undefined,
  ctx: ActorContext,
  what: { set: RecoveryWordsSet; wordsId: string; how: RecoveryWordsExport; store?: string }
): Promise<void> {
  const who = actorOf(ctx);
  await recordAuditEvent(sink, {
    eventType: AUDIT_EVENT.RECOVERY_WORDS_EXPORT,
    ...who,
    action: 'recovery-words-export',
    result: 'success',
    severity: 'high',
    resource: what.set === 'shared-folders' ? 'shared-folders' : `store:${what.store ?? ''}`,
    resourceType: what.set === 'shared-folders' ? 'shared-folders-recovery-words' : 'recovery-words',
    metadata: { ...who.metadata, set: what.set, ...(what.store ? { store: what.store } : {}), wordsId: what.wordsId, how: what.how }
  });
}
