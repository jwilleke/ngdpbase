/**
 * "Save your recovery words" — one reminder per person (#1876, operator plan
 * "one thing to save", 2026-10-20; the words are #1452).
 *
 * A person's private vaults open only with their password or their passkey's
 * key; a forgotten password and no recovery words means the vaults are gone,
 * and no backup or administrator can bring them back. So each person who has
 * vault keys gets one notification, addressed to them alone, asking them to
 * keep their 12 recovery words somewhere safe. Dismissing it is their
 * confirmation. It is deduplicated the way the site's other one-time notices
 * are (`pageMetadataMissing`, the backup-key notice): by its title and its
 * person among the stored notifications, which persist across restarts and
 * keep a dismissed one — so it is never sent to the same person twice.
 */
import logger from './logger.js';

/** The title of the reminder: one per person. */
export const RECOVERY_WORDS_TITLE = 'Keep your recovery words safe';

export const RECOVERY_WORDS_MESSAGE =
  'Your private vaults open only with your password or your passkey. If you forget your password, your 12 recovery words are the only way back in: ' +
  'nobody else, not even an administrator or a backup, can open your vaults without them. Keep the words somewhere safe, off this device ' +
  '(written on paper, or in a password manager). Dismiss this message once they are saved.';

interface NotificationsLike {
  addNotification(n: { type: 'user'; level: 'warning'; title: string; message: string; targetUsers: string[] }): Promise<string>;
  getAllNotifications?(includeExpired?: boolean): Array<{ title: string; targetUsers: string[] }>;
}

/**
 * Send `recipient` the reminder, once, when they have vault keys. The
 * recipient is the user's identity `@id`, as notifications store it (#2041),
 * or the username of an account with no identity record. Never throws: it
 * runs on the way through sign-in, which it must not stop.
 */
export async function remindRecoveryWords(
  notifications: NotificationsLike | null | undefined,
  recipient: string,
  hasKeys: () => Promise<boolean>
): Promise<boolean> {
  try {
    if (!notifications || !recipient) return false;
    const already = notifications.getAllNotifications?.(true)
      .some((n) => n.title === RECOVERY_WORDS_TITLE && n.targetUsers.length === 1 && n.targetUsers[0] === recipient) ?? false;
    if (already || !(await hasKeys())) return false;
    await notifications.addNotification({ type: 'user', level: 'warning', title: RECOVERY_WORDS_TITLE, message: RECOVERY_WORDS_MESSAGE, targetUsers: [recipient] });
    return true;
  } catch (err) {
    logger.warn(`[private-store] The recovery-words reminder for ${recipient} could not be sent:`, err);
    return false;
  }
}
