/**
 * EmailManager — shared outbound email transport.
 *
 * A single manager used by any feature that needs to send email:
 * magic-link auth, notification escalation, server-error alerts, etc.
 *
 * Two providers, selected by `ngdpbase.mail.provider`:
 *   console  — prints to server log (default / development)
 *   smtp     — sends via NodemailerMailProvider; works with any SMTP relay
 *              (Gmail, Resend, SendGrid, SES, self-hosted Postfix, …)
 *
 * Implements the MailProvider interface so it can be passed directly to
 * MagicLinkAuthProvider without any changes to that class.
 *
 * A failed send is never silent (#1916). Every sender goes through `send()`,
 * so it is reported here, once for all of them: logged (provider, recipient
 * domain, subject, error — never the body or the full address), the manager
 * shows degraded until the next send succeeds, and administrators get one
 * notification per `ngdpbase.mail.failure-notice.window-minutes` carrying a
 * running count, not one per email. `send()` still rejects, so a caller with
 * a person waiting can tell them.
 *
 * @see docs/admin/email-setup.md for operator setup instructions
 * @see {@link https://github.com/jwilleke/ngdpbase/issues/456}
 */

import BaseManager from './BaseManager.js';
import type { BackupData } from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { MailMessage, MailProvider } from '../mail/MailProvider.js';
import { ConsoleMailProvider } from '../mail/MailProvider.js';
import { NodemailerMailProvider } from '../mail/NodemailerMailProvider.js';
import logger from '../utils/logger.js';
import { administratorUsernames } from '../utils/administrators.js';

/** The degraded reason while sends fail; cleared by the next success. */
export const SEND_FAILING_REASON = 'outbound email is failing — see the server log and the administrator notification';

/** Shipped value of `ngdpbase.mail.failure-notice.window-minutes`. */
const DEFAULT_NOTICE_WINDOW_MINUTES = 60;

/** Title of the administrator notice. */
export const SEND_FAILING_TITLE = 'Email could not be sent';

interface NotificationManagerLike {
  createNotification(input: {
    type: 'system';
    title: string;
    message: string;
    level: 'error';
    targetUsers: string[];
    escalate?: boolean;
  }): Promise<string>;
  updateNotificationMessage?(id: string, message: string): Promise<boolean>;
}

/** The open administrator notice: one per window, counting every failure in it. */
interface FailureNotice {
  openedAt: number;
  count: number;
  /** Resolves to the notification id, or null when nobody was notified. */
  id: Promise<string | null>;
}

/** Recipient domain(s) only — the full address never reaches a log or a notice. */
function recipientDomains(to: string): string {
  const domains = new Set(
    String(to).split(',').map((a) => a.trim()).filter(Boolean)
      .map((a) => (a.includes('@') ? a.slice(a.lastIndexOf('@') + 1).replace(/>$/, '').toLowerCase() : 'unknown'))
  );
  return [...domains].join(',') || 'unknown';
}

/** An SMTP error often quotes the rejected address; keep only its domain. */
function redactAddresses(text: string): string {
  return text.replace(/[^\s<>"'@,;:()[\]]+@([A-Za-z0-9.-]+)/g, '…@$1');
}

class EmailManager extends BaseManager implements MailProvider {
  private provider: MailProvider;
  private providerName: string;
  private from: string;
  private enabled: boolean;
  private noticeWindowMs: number = DEFAULT_NOTICE_WINDOW_MINUTES * 60_000;
  private notice: FailureNotice | null = null;
  private failuresSinceSuccess = 0;

  constructor(engine: WikiEngine) {
    super(engine);
    this.provider = new ConsoleMailProvider();
    this.providerName = 'console';
    this.from = '';
    this.enabled = false;
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');

    this.enabled = (configManager?.getProperty('ngdpbase.mail.enabled', false) as boolean) ?? false;
    const providerKey = (configManager?.getProperty('ngdpbase.mail.provider', 'console') as string) ?? 'console';
    const globalFrom = (configManager?.getProperty('ngdpbase.mail.from', '') as string) ?? '';
    const windowMinutes = Number(configManager?.getProperty('ngdpbase.mail.failure-notice.window-minutes', DEFAULT_NOTICE_WINDOW_MINUTES));
    this.noticeWindowMs = (Number.isFinite(windowMinutes) && windowMinutes > 0 ? windowMinutes : DEFAULT_NOTICE_WINDOW_MINUTES) * 60_000;

    if (providerKey === 'smtp') {
      const smtpHost = (configManager?.getProperty('ngdpbase.mail.provider.smtp.host', '') as string) ?? '';
      const smtpPort = (configManager?.getProperty('ngdpbase.mail.provider.smtp.port', 587) as number) ?? 587;
      const smtpSecure = (configManager?.getProperty('ngdpbase.mail.provider.smtp.secure', false) as boolean) ?? false;
      const smtpUser = (configManager?.getProperty('ngdpbase.mail.provider.smtp.user', '') as string) ?? '';
      const smtpPass = (configManager?.getProperty('ngdpbase.mail.provider.smtp.pass', '') as string) ?? '';
      const smtpFrom = (configManager?.getProperty('ngdpbase.mail.provider.smtp.from', '') as string) ?? '';

      // Resolve effective from address: smtp.from overrides global mail.from
      this.from = smtpFrom || globalFrom;

      // Validate required SMTP fields
      if (!smtpHost) {
        logger.error('[EmailManager] ngdpbase.mail.provider.smtp.host is not configured — emails will fail. See docs/admin/email-setup.md');
      }
      if (!this.from) {
        logger.error('[EmailManager] No from address configured (set ngdpbase.mail.provider.smtp.from or ngdpbase.mail.from) — emails will be rejected. See docs/admin/email-setup.md');
      }
      if (!smtpUser) {
        logger.warn('[EmailManager] ngdpbase.mail.provider.smtp.user is empty — most SMTP relays require authentication');
      }
      if (!smtpPass) {
        logger.warn('[EmailManager] ngdpbase.mail.provider.smtp.pass is empty — most SMTP relays require authentication');
      }

      this.provider = new NodemailerMailProvider({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        user: smtpUser || undefined,
        pass: smtpPass || undefined,
        from: this.from
      });
      this.providerName = 'smtp';
    } else {
      // console provider — always warn so operators know mail is not being sent
      this.from = globalFrom;
      this.provider = new ConsoleMailProvider();
      this.providerName = 'console';
      logger.warn(
        '[EmailManager] provider is "console" — emails will be printed to the server log, not sent. ' +
        'Set ngdpbase.mail.provider: "smtp" for production. See docs/admin/email-setup.md'
      );
    }

    logger.info(`[EmailManager] Initialized provider=${this.providerName} enabled=${this.enabled}` +
      (this.from ? ` from=${this.from}` : ''));
  }

  /**
   * Send an email. Injects the configured from address if the message omits it.
   *
   * A failure is reported here (#1916) and then rethrown, so a caller with a
   * person waiting can tell them it was not sent.
   */
  async send(message: MailMessage): Promise<void> {
    const outgoing: MailMessage = this.from && !(message as MailMessage & { from?: string }).from
      ? { ...message, from: this.from } as MailMessage
      : message;
    try {
      await this.provider.send(outgoing);
    } catch (err) {
      this.reportFailure(outgoing, err);
      throw err;
    }
    this.reportSuccess();
  }

  /**
   * Convenience wrapper — build and send a message in one call.
   */
  async sendTo(to: string, subject: string, text: string, html?: string): Promise<void> {
    await this.send({ to, subject, text, ...(html ? { html } : {}) });
  }

  /**
   * Send without waiting, for a sender nobody is waiting on (a form's copy, a
   * reservation notice). Never rejects: a failure is already logged and
   * reported to administrators by `send()` (#1916), so there is nothing left
   * for the caller to do with it.
   */
  sendInBackground(to: string, subject: string, text: string, html?: string): void {
    this.sendTo(to, subject, text, html).catch(() => { /* reported by send() — #1916 */ });
  }

  /** Whether sends are failing right now: degraded by a failed send, not yet cleared by a success. */
  isDeliveryFailing(): boolean {
    const status = this.getManagerStatus();
    return status.state === 'degraded' && status.reason === SEND_FAILING_REASON;
  }

  private reportFailure(message: MailMessage, err: unknown): void {
    this.failuresSinceSuccess++;
    const domain = recipientDomains(message.to);
    const subject = String(message.subject ?? '').slice(0, 200);
    const error = redactAddresses(err instanceof Error ? err.message : String(err));
    logger.error(
      `[EmailManager] send failed: provider=${this.providerName} to-domain=${domain} ` +
      `subject=${JSON.stringify(subject)} error=${JSON.stringify(error)}`
    );
    this.markDegraded(SEND_FAILING_REASON, 'ngdpbase.mail.provider');
    void this.noticeAdministrators(domain, error);
  }

  private reportSuccess(): void {
    if (this.markReadyIfDegradedBy(SEND_FAILING_REASON)) {
      logger.info(`[EmailManager] sending works again (provider=${this.providerName}) after ${this.failuresSinceSuccess} failed send(s)`);
    }
    this.failuresSinceSuccess = 0;
  }

  /**
   * One notice per window, with a running count (#1916). A failure inside an
   * open window updates that notice; the first failure after it opens a new
   * one. The notice is created with `escalate: false`, so it is never emailed:
   * that send would fail and report another failure.
   *
   * Never throws — it runs off the failed send, and a notice that cannot be
   * written is already covered by the error log above.
   */
  private async noticeAdministrators(domain: string, error: string): Promise<void> {
    try {
      const now = Date.now();
      const open = this.notice && now - this.notice.openedAt < this.noticeWindowMs ? this.notice : null;
      if (open) {
        open.count++;
        const id = await open.id;
        if (id) await this.notifications()?.updateNotificationMessage?.(id, this.noticeMessage(open.count, domain, error));
        return;
      }
      // Set before any await, so failures arriving together share one notice.
      const notice: FailureNotice = { openedAt: now, count: 1, id: Promise.resolve(null) };
      this.notice = notice;
      notice.id = this.createNotice(notice, domain, error).catch((err: unknown) => {
        logger.error('[EmailManager] could not notify administrators that email is failing:', err);
        return null;
      });
      await notice.id;
    } catch (err) {
      logger.error('[EmailManager] could not notify administrators that email is failing:', err);
    }
  }

  private async createNotice(notice: FailureNotice, domain: string, error: string): Promise<string | null> {
    const notifications = this.notifications();
    if (!notifications) return null;
    const admins = await administratorUsernames(this.engine);
    // Nobody to tell is not a reason to tell everybody (an empty target list
    // means ALL users). The error log stands alone.
    if (!admins || admins.length === 0) {
      logger.error('[EmailManager] no user holds admin-system; failing email reported in the log only');
      return null;
    }
    return notifications.createNotification({
      type: 'system',
      level: 'error',
      title: SEND_FAILING_TITLE,
      message: this.noticeMessage(notice.count, domain, error),
      targetUsers: admins,
      escalate: false
    });
  }

  private noticeMessage(count: number, domain: string, error: string): string {
    const minutes = Math.round(this.noticeWindowMs / 60_000);
    return `${count} email${count === 1 ? '' : 's'} could not be sent through the ${this.providerName} provider. ` +
      `Latest: a message to an address at ${domain} failed with: ${error}. ` +
      'Check the mail settings (ngdpbase.mail.*) and the server log. ' +
      `Failures in the ${minutes} minutes after this notice was created are counted here rather than sent as new notices.`;
  }

  private notifications(): NotificationManagerLike | null {
    return this.engine?.getManager?.<NotificationManagerLike>('NotificationManager') ?? null;
  }

  /** Name of the active provider: 'console' | 'smtp' */
  getProviderName(): string {
    return this.providerName;
  }

  /** Effective from address (smtp.from or mail.from) */
  getFrom(): string {
    return this.from;
  }

  /** Whether ngdpbase.mail.enabled is true */
  isEnabled(): boolean {
    return this.enabled;
  }

  async shutdown(): Promise<void> {
    await super.shutdown();
  }

  backup(): Promise<BackupData> {
    return Promise.resolve({
      managerName: 'EmailManager',
      timestamp: new Date().toISOString(),
      data: { provider: this.providerName, enabled: this.enabled }
    });
  }

  restore(_backupData: BackupData): Promise<void> {
    return Promise.resolve();
  }
}

export default EmailManager;

