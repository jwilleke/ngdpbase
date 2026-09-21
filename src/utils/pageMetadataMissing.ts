/**
 * A page that exists but has no metadata is damage, and it is reported loudly
 * (#1431 step 7, decided by the operator 2026-09-21).
 *
 * A page decision reads the page's frontmatter — author, private, author-lock,
 * audience. When a page EXISTS and this subject could read its content, but no
 * metadata comes back, the file is broken or unreadable. That must not look
 * like an ordinary "you lack access": the reader gets a 500, the server logs
 * at error level, and administrators are notified.
 *
 * "No metadata" is only damage in that one situation. It is NOT damage when:
 *
 * - the page does not exist — that stays the not-found path;
 * - the page is sealed and this session cannot unlock it (#1422) — the
 *   content never resolves, so this is never reached; that is a correct
 *   refusal, and paging an admin every time an anonymous visitor tried it
 *   would bury the real reports;
 * - the action is `create` — a page being created has no metadata yet.
 *
 * So this is called only from the sites that have just proven existence by
 * loading the content: the view route and the edit route. The decider itself
 * cannot tell these cases apart, and denies without reporting (see
 * `ACLManager._runEvaluator`).
 *
 * __Who counts as an administrator here__ is whoever holds `admin-system`,
 * asked per user through the policy — the same permission the author-lock
 * override and the maintenance bypass ask (#1431 7b). Never a role name.
 *
 * __De-duplicated per page.__ One damaged page viewed a thousand times must
 * produce one notification, not a thousand; an existing active notification
 * for the page suppresses another. The error log is written every time,
 * because that is where an operator correlates it with a request.
 */
import logger from './logger.js';

/** Thrown by a route that has proven a page exists but found no metadata. */
export class PageMetadataMissingError extends Error {
  readonly pageName: string;
  constructor(pageName: string) {
    super(`Page '${pageName}' exists but has no metadata — the page file is damaged or unreadable`);
    this.name = 'PageMetadataMissingError';
    this.pageName = pageName;
  }
}

/** The notification title, and the key it is de-duplicated on. */
export function missingMetadataTitle(pageName: string): string {
  return `Page has no metadata: ${pageName}`;
}

type EngineLike = { getManager: (name: string) => unknown } | null | undefined;

interface NotificationLike {
  title: string;
  expiresAt: Date | null;
}
interface NotificationManagerLike {
  getAllNotifications(includeExpired?: boolean): NotificationLike[];
  createNotification(input: {
    type: string;
    title: string;
    message: string;
    level: string;
    targetUsers: string[];
  }): Promise<string>;
}
interface UserManagerLike {
  getUsers(): Promise<Array<{ username: string }>>;
  userHoldsPermission(username: string, action: string): Promise<boolean>;
}

/**
 * Log the damage and notify administrators, once per page.
 *
 * Never throws: it runs on the way to rendering a 500, and a failure to notify
 * must not replace the error page the reader was about to get. A notification
 * that cannot be sent is logged, which is still loud.
 */
export async function reportMissingPageMetadata(
  engine: EngineLike,
  pageName: string,
  action: string,
  requestedBy: string | undefined
): Promise<void> {
  logger.error(
    `[PAGE-INTEGRITY] '${pageName}' exists but has no metadata (action=${action}, ` +
    `by=${requestedBy ?? 'anonymous'}) — the page file is damaged or unreadable; refused with 500`
  );

  try {
    const notifications = engine?.getManager('NotificationManager') as NotificationManagerLike | null | undefined;
    const users = engine?.getManager('UserManager') as UserManagerLike | null | undefined;
    if (!notifications || !users) return;

    const title = missingMetadataTitle(pageName);
    if (notifications.getAllNotifications(false).some((n) => n.title === title)) return;

    const admins: string[] = [];
    for (const { username } of await users.getUsers()) {
      if (await users.userHoldsPermission(username, 'admin-system')) admins.push(username);
    }
    // No administrator to tell is not a reason to tell everybody: an empty
    // target list means ALL users in NotificationManager, which would announce
    // a damaged page to every reader. The error log above stands alone.
    if (admins.length === 0) {
      logger.error(`[PAGE-INTEGRITY] no user holds admin-system; '${pageName}' reported in the log only`);
      return;
    }

    await notifications.createNotification({
      type: 'system',
      title,
      message:
        `The page '${pageName}' exists but its metadata could not be read, so it cannot be opened. ` +
        'Readers see an error. Check the page file in the page store — its frontmatter is missing or damaged.',
      level: 'error',
      targetUsers: admins
    });
  } catch (err) {
    logger.error(`[PAGE-INTEGRITY] could not notify administrators about '${pageName}':`, err);
  }
}
