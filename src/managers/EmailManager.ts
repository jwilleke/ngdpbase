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
 * `sendTo(ctx, …, { attachments })` attaches files, a PDF from
 * `ExportManager.htmlToPdf` for one (#1974), up to
 * `ngdpbase.mail.attachments.max-bytes` in total. A log line names how many
 * files and bytes, never their names or content.
 *
 * @see docs/admin/email-setup.md for operator setup instructions
 * @see {@link https://github.com/jwilleke/ngdpbase/issues/456}
 */

import BaseManager from './BaseManager.js';
import type { BackupData } from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { MailAttachment, MailMessage, MailProvider } from '../mail/MailProvider.js';
import { ConsoleMailProvider, describeAttachments } from '../mail/MailProvider.js';
import type { ActorContext } from '../context/ActorContext.js';
import { actorOf } from '../context/ActorContext.js';

export type { MailAttachment } from '../mail/MailProvider.js';
import { NodemailerMailProvider } from '../mail/NodemailerMailProvider.js';
import logger from '../utils/logger.js';
import { administratorUsernames } from '../utils/administrators.js';
import { emailDomain, errorForLog } from '../utils/emailForLog.js';

/** The degraded reason while sends fail; cleared by the next success. */
export const SEND_FAILING_REASON = 'outbound email is failing — see the server log and the administrator notification';

/** Shipped value of `ngdpbase.mail.failure-notice.window-minutes`. */
const DEFAULT_NOTICE_WINDOW_MINUTES = 60;

/** Title of the administrator notice. */
export const SEND_FAILING_TITLE = 'Email could not be sent';

/** Shipped value of `ngdpbase.mail.attachments.max-bytes`: 10 MiB, under most relays' message limit. */
const DEFAULT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** An attachment the message cannot carry (#1974): refused before sending, so it is not a delivery failure. */
export class AttachmentRefusedError extends Error {
  readonly code = 'ATTACHMENT_REFUSED';
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentRefusedError';
  }
}

/** What a caller may add after the body (#1974). */
export interface SendOptions {
  /** Files to attach, e.g. a PDF from `ExportManager.htmlToPdf`. */
  attachments?: MailAttachment[];
}

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

class EmailManager extends BaseManager implements MailProvider {
  private provider: MailProvider;
  private providerName: string;
  private from: string;
  private enabled: boolean;
  private noticeWindowMs: number = DEFAULT_NOTICE_WINDOW_MINUTES * 60_000;
  private notice: FailureNotice | null = null;
  private failuresSinceSuccess = 0;
  private attachmentMaxBytes: number = DEFAULT_ATTACHMENT_MAX_BYTES;

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
    const maxBytes = Number(configManager?.getProperty('ngdpbase.mail.attachments.max-bytes', DEFAULT_ATTACHMENT_MAX_BYTES));
    this.attachmentMaxBytes = Number.isInteger(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_ATTACHMENT_MAX_BYTES;

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
      (this.from ? ` from-domain=${emailDomain(this.from)}` : ''));
  }

  /**
   * Send an email. Injects the configured from address if the message omits it.
   *
   * A failure is reported here (#1916) and then rethrown, so a caller with a
   * person waiting can tell them it was not sent.
   */
  async send(message: MailMessage): Promise<void> {
    // A malformed or oversized attachment is the caller's error, refused before
    // the provider sees it: not a delivery failure, so nothing is degraded.
    this.checkAttachments(message.attachments);
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
   * Build and send a message in one call.
   *
   * @param ctx - Who is sending (security-posture P1); named in the log line when the message carries attachments
   * @param to - Recipient address
   * @param subject - Subject line
   * @param text - Plain-text body
   * @param html - Optional HTML body
   * @param options - Attachments (#1974); their total is capped by `ngdpbase.mail.attachments.max-bytes`
   */
  async sendTo(ctx: ActorContext, to: string, subject: string, text: string, html?: string, options: SendOptions = {}): Promise<void> {
    if (!ctx) throw new TypeError('sendTo: a context is required (security-posture P1)');
    const { attachments } = options;
    if (attachments?.length) {
      logger.info(`[EmailManager] sending to-domain=${emailDomain(to)}${describeAttachments(attachments)} by=${actorOf(ctx).user}`);
    }
    await this.send({ to, subject, text, ...(html ? { html } : {}), ...(attachments?.length ? { attachments } : {}) });
  }

  /**
   * Send without waiting, for a sender nobody is waiting on (a form's copy, a
   * reservation notice). Never rejects: a failure is already logged and
   * reported to administrators by `send()` (#1916), so there is nothing left
   * for the caller to do with it. An attachment over the limit is logged here.
   */
  sendInBackground(ctx: ActorContext, to: string, subject: string, text: string, html?: string, options: SendOptions = {}): void {
    this.sendTo(ctx, to, subject, text, html, options).catch((err: unknown) => {
      // A delivery failure was reported by send() (#1916); only a refusal before it is logged here.
      if (err instanceof AttachmentRefusedError) logger.error(`[EmailManager] not sent to-domain=${emailDomain(to)}: ${err.message}`);
    });
  }

  /** Refuse attachments a mail relay would choke on, or that are not what they say. */
  private checkAttachments(attachments: MailAttachment[] | undefined): void {
    if (attachments === undefined) return;
    if (!Array.isArray(attachments)) throw new AttachmentRefusedError('attachments must be an array');
    let total = 0;
    for (const [i, a] of attachments.entries()) {
      if (!a || typeof a.filename !== 'string' || !a.filename.trim() || /[\r\n\0/\\]/.test(a.filename)) {
        throw new AttachmentRefusedError(`attachment ${i}: filename must be a plain file name`);
      }
      if (typeof a.contentType !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(a.contentType)) {
        throw new AttachmentRefusedError(`attachment ${i}: contentType must be a media type such as application/pdf`);
      }
      if (!Buffer.isBuffer(a.content)) throw new AttachmentRefusedError(`attachment ${i}: content must be a Buffer`);
      total += a.content.length;
    }
    if (total > this.attachmentMaxBytes) {
      throw new AttachmentRefusedError(`attachments total ${total} bytes, over ngdpbase.mail.attachments.max-bytes (${this.attachmentMaxBytes})`);
    }
  }

  /** Whether sends are failing right now: degraded by a failed send, not yet cleared by a success. */
  isDeliveryFailing(): boolean {
    const status = this.getManagerStatus();
    return status.state === 'degraded' && status.reason === SEND_FAILING_REASON;
  }

  private reportFailure(message: MailMessage, err: unknown): void {
    this.failuresSinceSuccess++;
    const domain = emailDomain(message.to);
    const subject = String(message.subject ?? '').slice(0, 200);
    const error = errorForLog(err);
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

