import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import { scheduleContext, systemContext } from '../context/bootActions.js';
import type IdentityManager from './IdentityManager.js';
import { IDENTITY_ID_PREFIX } from '../utils/username.js';
import type { ActorContext } from '../context/ActorContext.js';
import type EmailManager from './EmailManager.js';
import type UserManager from './UserManager.js';
import type PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import type { PluginFormatters } from './PluginManager.js';
import { emailDomain, errorForLog } from '../utils/emailForLog.js';

/**
 * Notification object structure
 */
export interface Notification {
  id: string;
  type: 'maintenance' | 'system' | 'user';
  title: string;
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
  /** Who it is for, by identity `@id` (#2041); empty means every user. A name with no account is kept as given. */
  targetUsers: string[];
  createdAt: Date;
  expiresAt: Date | null;
  /** Who dismissed it, by identity `@id` (#2041); a name with no account as given. */
  dismissedBy: string[];
}

/**
 * Input for creating a notification
 */
export interface NotificationInput {
  type?: 'maintenance' | 'system' | 'user';
  title?: string;
  message?: string;
  level?: 'info' | 'warning' | 'error' | 'success';
  /** Usernames or identity `@id`s; stored as `@id`s (#2041). Empty or absent: every user. */
  targetUsers?: string[];
  expiresAt?: Date | null;
  /**
   * False: never email this notification, whatever the escalation settings
   * (#1916). A notice that email is failing must not itself be emailed — the
   * send would fail and report another failure. Not stored.
   */
  escalate?: boolean;
}

/** A notice for administrators: the type and the audience are not the caller's to choose. */
export type AdminNoticeInput = Omit<NotificationInput, 'type' | 'targetUsers'>;

/**
 * Notification statistics
 */
export interface NotificationStats {
  total: number;
  active: number;
  expired: number;
  byType: Record<string, number>;
  byLevel: Record<string, number>;
}

/**
 * Maintenance configuration
 */
export interface MaintenanceConfig {
  [key: string]: unknown;
}

/**
 * Stored notifications data structure
 */
interface NotificationsData {
  lastSaved: string;
  notifications: Record<string, Notification>;
}

/**
 * NotificationManager - Handles system notifications and user alerts
 *
 * Manages user-facing notifications and system alerts with persistent storage.
 * Extends BaseManager following the modular manager pattern.
 *
 * @class NotificationManager
 * @extends BaseManager
 *
 * @property {Map<string, Notification>} notifications - Active notifications by ID
 * @property {number} notificationId - Auto-incrementing notification ID
 * @property {string|null} storagePath - Path to notifications storage file
 *
 * @see {@link BaseManager} for base functionality
 *
 * @example
 * const notificationManager = engine.getManager('NotificationManager');
 * notificationManager.addNotification({ title: 'Welcome!', level: 'info' });
 */
class NotificationManager extends BaseManager {
  protected notifications: Map<string, Notification>;
  protected notificationId: number;
  private storagePath: string | null;
  private saveInterval: NodeJS.Timeout | null;
  private logger: typeof logger;

  /**
   * Creates a new NotificationManager instance
   *
   * @constructor
   * @param {any} engine - The wiki engine instance
   */

  constructor(engine: WikiEngine) {
    super(engine);
    this.notifications = new Map();
    this.notificationId = 0;
    this.storagePath = null;
    this.saveInterval = null;
    this.logger = logger.child({ component: 'NotificationManager' });
  }

  /**
   * Initialize the notification manager
   *
   * @async
   * @param {Record<string, unknown>} [config={}] - Configuration object
   * @returns {Promise<void>}
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);
    this.logger = logger.child({ component: 'NotificationManager' });

    // Pull settings from ConfigurationManager (with safe fallbacks)
    const cfgMgr = this.engine?.getManager<ConfigurationManager>('ConfigurationManager');

    // Use getResolvedDataPath to support INSTANCE_DATA_FOLDER
    const dataDirAbs = cfgMgr?.getResolvedDataPath?.(
      'ngdpbase.notifications.dir',
      './data/notifications'
    ) ?? path.resolve(process.cwd(), process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data', 'notifications');
    const fileNameCfg = (cfgMgr?.getProperty?.('ngdpbase.notifications.file', 'notifications.json') as string | null) ?? 'notifications.json';
    const intervalCfg = Number(cfgMgr?.getProperty?.('ngdpbase.notifications.auto-save-interval') ?? 5 * 60 * 1000);

    // Build storage path from resolved directory
    this.storagePath = path.join(dataDirAbs, String(fileNameCfg));
    const intervalMs = Number.isFinite(Number(intervalCfg)) ? Number(intervalCfg) : 5 * 60 * 1000;

    // Ensure data directory exists
    const dataDirPath = path.dirname(this.storagePath);
    const preflight = this.preflightConfiguredPath(
      'ngdpbase.notifications.directory',
      dataDirPath
    );
    if (preflight.ok) {
      try {
        await fs.mkdir(dataDirPath, { recursive: true });
      } catch (error) {
        this.logger.warn('Failed to create data directory:', (error as Error).message);
      }
    }
    // If preflight failed, the warning was already logged. loadNotifications()
    // below will gracefully no-op since the file doesn't exist.

    // Load existing notifications
    await this.loadNotifications();
    await this.convertRecipientsToIdentityIds();

    // Set up periodic save
    if (this.saveInterval) clearInterval(this.saveInterval);
    this.saveInterval = setInterval(
      () => {
        void this.saveNotifications();
      },
      Math.max(1000, intervalMs)
    );

    this.logger.info(`NotificationManager initialized with persistence: path=${this.storagePath}, intervalMs=${Math.max(1000, intervalMs)}`);
    this.validateEscalationConfig();
  }

  /**
   * Load notifications from storage
   */
  private async loadNotifications(): Promise<void> {
    if (!this.storagePath) return;

    try {
      const data = await fs.readFile(this.storagePath, 'utf8');
      const notificationsData = JSON.parse(data) as NotificationsData;

      // Restore notifications from storage
      for (const [id, notification] of Object.entries(notificationsData.notifications || {})) {
        // Convert date strings back to Date objects
        if (notification.createdAt) {
          notification.createdAt = new Date(notification.createdAt);
        }
        if (notification.expiresAt) {
          notification.expiresAt = new Date(notification.expiresAt);
        }

        this.notifications.set(id, notification);

        // Update notification ID counter
        const idNum = parseInt(id.split('_')[1]);
        if (idNum > this.notificationId) {
          this.notificationId = idNum;
        }
      }

      this.logger.info(`Loaded ${this.notifications.size} notifications from storage`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.info('No existing notification storage file found, starting fresh');
      } else {
        this.logger.error('Failed to load notifications from storage:', (error as Error).message);
      }
    }
  }

  /**
   * Once, at start-up (#2041): every stored `targetUsers` and `dismissedBy`
   * entry that is still a username gets `IdentityManager.convertReference`'s
   * answer, under the system context, and the file is written once: that
   * user's identity `@id`, or `orphan:<name>` when the name has no account
   * (it then reaches nobody: a later account with that name is never
   * addressed by it). `@id`s, orphans, `anonymous` and the system principal
   * are left alone, so a second start writes nothing. Orphans are reported,
   * counts only: a log line and the admin dashboard's needs-attention list.
   * When the identity store cannot answer, nothing is changed and the pass is
   * postponed to the next start, reported the same way.
   */
  private async convertRecipientsToIdentityIds(): Promise<void> {
    const identities = this.engine?.getManager<IdentityManager>('IdentityManager');
    if (!identities) return;
    if (!identities.canAnswer()) {
      this.postponeConversion('the identity store is unavailable');
      return;
    }
    const ctx = systemContext(this.engine, 'convert notification recipients from username to identity @id (#2041)');
    const changes: Array<{ list: string[]; at: number; value: string }> = [];
    let converted = 0, orphans = 0;
    try {
      for (const notification of this.notifications.values()) {
        for (const field of ['targetUsers', 'dismissedBy'] as const) {
          const list = Array.isArray(notification[field]) ? notification[field] : [];
          for (let at = 0; at < list.length; at++) {
            if (typeof list[at] !== 'string') continue;
            const { value, outcome } = await identities.convertReference(ctx, list[at]);
            if (outcome === 'orphan' || outcome === 'orphaned') orphans++;
            if (outcome === 'converted') converted++;
            if (value !== list[at]) changes.push({ list, at, value });
          }
        }
      }
    } catch (error) {
      this.postponeConversion(error instanceof Error ? error.message : String(error));
      return;
    }
    for (const { list, at, value } of changes) list[at] = value;
    if (changes.length > 0) {
      await this.saveNotifications();
      this.logger.info(`Converted ${converted} notification recipient(s) from username to identity @id (#2041)`);
    }
    if (orphans > 0) {
      // #2097: an orphan is the intended final state and needs nothing from an administrator, so it is logged at info and never marked needs-attention.
      this.logger.info(`${orphans} notification recipient(s) are orphaned: their username has no account, so the notice reaches nobody by it (#2041)`);
    }
  }

  /** The identity store could not answer: nothing is converted this start, and the next start tries again (#2041). */
  private postponeConversion(why: string): void {
    const reason = 'Notification recipients were not converted to identity @ids: identity store unavailable, conversion postponed to the next start (#2041)';
    this.logger.warn(`${reason}: ${why}`);
    this.markNeedsAttention(reason);
  }

  /**
   * Save notifications to storage
   */
  private async saveNotifications(): Promise<void> {
    if (!this.storagePath) return;

    try {
      const notificationsData: NotificationsData = {
        lastSaved: new Date().toISOString(),
        notifications: Object.fromEntries(this.notifications)
      };

      await fs.writeFile(this.storagePath, JSON.stringify(notificationsData, null, 2));
      this.logger.debug(`Saved ${this.notifications.size} notifications to storage`);
    } catch (error) {
      this.logger.error('Failed to save notifications to storage:', (error as Error).message);
    }
  }

  /**
   * Create a new notification
   * @param {NotificationInput} notification - Notification object
   * @param {string} notification.type - Type of notification (maintenance, system, user)
   * @param {string} notification.title - Notification title
   * @param {string} notification.message - Notification message
   * @param {string} notification.level - Severity level (info, warning, error, success)
   * @param {Array} notification.targetUsers - Array of usernames to notify (empty for all)
   * @param {Date} notification.expiresAt - When notification expires
   * @returns {Promise<string>} Notification ID
   */
  async createNotification(notification: NotificationInput): Promise<string> {
    // #2041: recipients by identity @id; a name with no account as given.
    const identities = this.engine?.getManager<IdentityManager>('IdentityManager');
    const targetUsers: string[] = [];
    for (const name of notification.targetUsers || []) {
      targetUsers.push(identities && !name.startsWith(IDENTITY_ID_PREFIX)
        ? (await identities.identityIdOf(systemContext(this.engine, 'address a notification: the recipient identity @id (#2041)'), name)) ?? name
        : name);
    }
    const id = `notification_${++this.notificationId}`;
    const fullNotification: Notification = {
      id,
      type: notification.type || 'system',
      title: notification.title || 'System Notification',
      message: notification.message || '',
      level: notification.level || 'info',
      targetUsers,
      createdAt: new Date(),
      expiresAt: notification.expiresAt || null,
      dismissedBy: []
    };

    this.notifications.set(id, fullNotification);

    this.logger.info(`Created notification: ${id}`, {
      type: fullNotification.type,
      level: fullNotification.level,
      title: fullNotification.title
    });

    // Save to storage
    await this.saveNotifications();

    if (notification.escalate !== false) this.escalateByEmail(fullNotification);  // fire-and-forget
    return id;
  }

  /**
   * Replace an active notification's message in place (#1916) — a running
   * count on one notice instead of a new notice per event. Never escalates:
   * the notification was already escalated, or not, when it was created.
   * @returns false when there is no such notification
   */
  async updateNotificationMessage(notificationId: string, message: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;
    notification.message = message;
    await this.saveNotifications();
    return true;
  }

  /**
   * The one way to tell administrators something (#2040): a `system`
   * notification targeted at the users holding `admin-system`. A notification
   * with no targetUsers reaches every user, so no admin notice is created any
   * other way. Nobody holds admin-system: the log line stands alone and null is
   * returned.
   *
   * @returns the notification id, or null when there was nobody to tell
   */
  async notifyAdmins(input: AdminNoticeInput): Promise<string | null> {
    const pdp = this.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint');
    const admins = (await pdp?.usersHolding('admin-system')) ?? [];
    if (admins.length === 0) {
      this.logger.error(`No user holds admin-system; '${input.title ?? 'System Notification'}' is in the log only (#2040)`);
      return null;
    }
    return this.createNotification({ ...input, type: 'system', targetUsers: admins });
  }

  /**
   * Add a notification (alias for createNotification for backward compatibility)
   * @param {NotificationInput} notification - Notification object
   * @returns {Promise<string>} Notification ID
   */
  async addNotification(notification: NotificationInput): Promise<string> {
    return this.createNotification(notification);
  }

  /**
   * The notifications for the caller: addressed to every user, or to them by
   * identity `@id` (#2041), or by username on one with no account; never one
   * they dismissed.
   * @param ctx - Who is asking: the request's subject, forwarded
   * @param {boolean} includeExpired - Include expired notifications
   * @returns Array of notifications
   */
  async getUserNotifications(ctx: ActorContext, includeExpired: boolean = false): Promise<Notification[]> {
    const username = ctx.username;
    const id = await this.engine?.getManager<IdentityManager>('IdentityManager')
      ?.identityIdOf(systemContext(this.engine, 'list notifications for a user: their identity @id (#2041)'), username);
    const me = (who: string): boolean => who === username || (Boolean(id) && who === id);
    const now = new Date();
    const userNotifications: Notification[] = [];

    for (const notification of this.notifications.values()) {
      // Check if notification is expired
      if (!includeExpired && notification.expiresAt && notification.expiresAt < now) {
        continue;
      }

      // Check if notification is for this user or all users
      if (notification.targetUsers.length === 0 || notification.targetUsers.some(me)) {
        // Check if user has dismissed this notification
        if (!notification.dismissedBy.some(me)) {
          userNotifications.push(notification);
        }
      }
    }

    return userNotifications;
  }

  /**
   * Dismiss a notification for the caller.
   *
   * #1235: takes the caller's context, not a name, for a uniform door — the
   * dismisser is `ctx.username`. Hides the banner from that one person and
   * changes nothing else; recorded in the log line, not the audit trail.
   * @param {string} notificationId - Notification ID
   * @param ctx - Who is dismissing: the request's subject, forwarded
   * @returns {Promise<boolean>} Success status
   */
  async dismissNotification(notificationId: string, ctx: ActorContext): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification) {
      return false;
    }

    const username = ctx.username;
    // #2041: the dismisser by identity @id; a name with no account as given.
    const dismisser = (await this.engine?.getManager<IdentityManager>('IdentityManager')
      ?.identityIdOf(systemContext(this.engine, 'record a notification dismissal: the user identity @id (#2041)'), username)) ?? username;
    if (!notification.dismissedBy.includes(dismisser)) {
      notification.dismissedBy.push(dismisser);
      this.logger.info(`Notification ${notificationId} dismissed by ${username}`);

      // Save to storage
      await this.saveNotifications();
    }

    return true;
  }

  /**
   * Create maintenance mode notification
   * @param {boolean} enabled - Whether maintenance mode is enabled
   * @param {string} adminUsername - Admin who toggled maintenance mode
   * @param {MaintenanceConfig} config - Maintenance configuration
   * @returns {Promise<string>} Notification ID
   */
  async createMaintenanceNotification(enabled: boolean, adminUsername: string, _config: MaintenanceConfig = {}): Promise<string> {
    const title = enabled ? 'Maintenance Mode Enabled' : 'Maintenance Mode Disabled';
    const message = enabled ? `The system is now in maintenance mode. Regular users will see a maintenance page until it is disabled by ${adminUsername}.` : `Maintenance mode has been disabled by ${adminUsername}. The system is now fully accessible to all users.`;

    const level = enabled ? 'warning' : 'success';

    // Set expiration - maintenance notifications expire when mode changes
    const expiresAt = enabled ? null : new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for disable notifications

    return await this.createNotification({
      type: 'maintenance',
      title,
      message,
      level,
      targetUsers: [], // All users
      expiresAt
    });
  }

  /**
   * Get all active notifications
   * @param {boolean} includeExpired - Include expired notifications
   * @returns {Notification[]} Array of all notifications
   */
  getAllNotifications(includeExpired: boolean = false): Notification[] {
    const now = new Date();
    const allNotifications: Notification[] = [];

    for (const notification of this.notifications.values()) {
      if (!includeExpired && notification.expiresAt && notification.expiresAt < now) {
        continue;
      }
      allNotifications.push(notification);
    }

    return allNotifications;
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpiredNotifications(): Promise<void> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [id, notification] of this.notifications.entries()) {
      if (notification.expiresAt && notification.expiresAt < now) {
        this.notifications.delete(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info(`Cleaned up ${cleanedCount} expired notifications`);

      // Save to storage after cleanup
      await this.saveNotifications();
    }
  }

  /**
   * Clear all active (non-expired) notifications
   * @returns {Promise<number>} Number of cleared notifications
   */
  async clearAllActive(): Promise<number> {
    const now = new Date();
    let clearedCount = 0;

    for (const [id, notification] of this.notifications.entries()) {
      // Only delete active notifications (not expired ones)
      if (!notification.expiresAt || notification.expiresAt >= now) {
        this.notifications.delete(id);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      this.logger.info(`Cleared ${clearedCount} active notifications`);

      // Save to storage after clearing
      await this.saveNotifications();
    }

    return clearedCount;
  }

  /**
   * Get notification statistics
   * @returns {NotificationStats} Statistics object
   */
  getStats(): NotificationStats {
    const now = new Date();
    let active = 0;
    let expired = 0;
    const byType: Record<string, number> = {};
    const byLevel: Record<string, number> = {};

    for (const notification of this.notifications.values()) {
      if (notification.expiresAt && notification.expiresAt < now) {
        expired++;
      } else {
        active++;
      }

      byType[notification.type] = (byType[notification.type] || 0) + 1;
      byLevel[notification.level] = (byLevel[notification.level] || 0) + 1;
    }

    return {
      total: this.notifications.size,
      active,
      expired,
      byType,
      byLevel
    };
  }

  private validateEscalationConfig(): void {
    const configManager = this.engine?.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) return;
    if (!configManager.getProperty('ngdpbase.notifications.escalation.enabled', false)) return;

    const emailManager = this.engine?.getManager<EmailManager>('EmailManager');
    if (!emailManager?.isEnabled()) {
      this.logger.warn('[NotificationManager] escalation.enabled=true but ngdpbase.mail.enabled=false — escalation emails will not send');
      return;
    }
    if (emailManager.getProviderName() === 'console') {
      this.logger.warn('[NotificationManager] escalation.enabled=true but mail provider is "console" — emails will print to log, not be delivered');
    }
    if (!emailManager.getFrom()) {
      this.logger.warn('[NotificationManager] escalation.enabled=true but no from address configured — escalation emails will not send');
      return;
    }
    this.logger.info('[NotificationManager] Email escalation active — levels: %s, to: holders of admin-system',
      configManager.getProperty('ngdpbase.notifications.escalation.levels', ['error'])
    );
  }

  private escalateByEmail(notification: Notification): void {
    this._doEscalateByEmail(notification).catch(err => {
      this.logger.warn(`[NotificationManager] Email escalation failed: ${errorForLog(err)}`);
    });
  }

  private async _doEscalateByEmail(notification: Notification): Promise<void> {
    const configManager = this.engine?.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) return;

    const enabled = configManager.getProperty('ngdpbase.notifications.escalation.enabled', false) as boolean;
    if (!enabled) return;

    const levels = configManager.getProperty('ngdpbase.notifications.escalation.levels', ['error']) as string[];
    if (!levels.includes(notification.level)) return;

    const emailManager = this.engine?.getManager<EmailManager>('EmailManager');
    if (!emailManager?.isEnabled()) {
      this.logger.debug('[NotificationManager] Email escalation skipped: mail not enabled');
      return;
    }
    if (!emailManager.getFrom()) {
      this.logger.warn('[NotificationManager] Email escalation skipped: no from address configured');
      return;
    }

    const userManager = this.engine?.getManager<UserManager>('UserManager');
    if (!userManager) return;

    // #2196: the people an admin notice reaches, holders of admin-system asked
    // of the PDP as notifyAdmins does, never a role name.
    const admins = new Set((await this.engine?.getManager<PolicyDecisionPoint>('PolicyDecisionPoint')?.usersHolding('admin-system')) ?? []);
    const withEmail = (await userManager.getUsers())
      .filter(u => admins.has(u.username) && u.isActive !== false && u.email && u.email.includes('@'));

    if (withEmail.length === 0) {
      this.logger.debug('[NotificationManager] No holder of admin-system with an email address; nothing to escalate to');
      return;
    }

    const subject = `[${notification.level.toUpperCase()}] ${notification.title}`;
    const text = `${notification.title}\n\n${notification.message}\n\nLevel: ${notification.level}\nCreated: ${notification.createdAt.toISOString()}`;
    // Titles and messages can carry file names (#2191); escape with PluginManager's
    // formatter (#1820, the one escapeHtml), then keep the line breaks. Its absence
    // is a wiring fault, not a reason to send a value unescaped.
    const formatters = this.engine?.getManager<{ formatters?: PluginFormatters }>('PluginManager')?.formatters;
    if (!formatters) throw new Error('PluginManager is not available to escape the escalation email (#2191)');
    const { escapeHtml } = formatters;
    const html =`<h2>${escapeHtml(notification.title)}</h2><p>${escapeHtml(notification.message).replace(/\n/g, '<br>')}</p><p><strong>Level:</strong> ${notification.level}<br><strong>Created:</strong> ${notification.createdAt.toISOString()}</p>`;

    const sender = scheduleContext(this.engine, `notification escalation: email ${notification.level} notice`);
    for (const user of withEmail) {
      // #1916: a failed send is reported once, by EmailManager; it is not
      // logged again here, and the other recipients are still tried.
      const sent = await emailManager.sendTo(sender, user.email, subject, text, html).then(() => true, () => false);
      if (sent) this.logger.info(`[NotificationManager] Escalation email sent to ${user.username} (an address at ${emailDomain(user.email)})`);
    }
  }

  /**
   * Shutdown the notification manager
   */
  async shutdown(): Promise<void> {
    // Clear the save interval
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }

    // Final save
    await this.saveNotifications();

    this.logger.info('NotificationManager shutdown complete');
  }
}

export default NotificationManager;

