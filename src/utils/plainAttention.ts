/**
 * Plain wording for dashboard items that more than one manager raises (#2354).
 *
 * The dashboard's "needs attention" and "not working" items are read by home
 * users. Each says what is wrong and one thing to do, with no issue numbers,
 * setting names, environment variable names, file paths or "see the log". The
 * developer detail goes to the log, beside the call that marks the item.
 */

/** Where a staged restore is looked at and cancelled: the Backup page. */
export const STAGED_RESTORE_FIX = { fixUrl: '/admin/backup', fixLabel: 'Open Admin → Backup' };

/** A staged restore that was set aside at start-up instead of put back (#1876, #1985). */
export function stagedRestoreNotApplied(what: string): string {
  return `A saved copy of ${what} was not put back when the site started, so what was there before is still in use. Open the Backup page to see what to do next.`;
}

/** Said where the fix is a setting only the server can change: the app refuses to save it. */
export const IN_SERVER_SETTINGS = "This is set in the server's settings, outside this page.";

/** A configured folder on a drive that is not connected (`preflightConfiguredPath`). */
export const UNUSABLE_FOLDER_REASON =
  'The drive or folder this feature keeps its files on is not connected, so it is switched off. Connect the drive again, or choose another folder, then restart the site.';
