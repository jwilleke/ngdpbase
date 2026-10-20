/**
 * MailProvider — pluggable email transport interface.
 *
 * Implementations:
 *   ConsoleMailProvider  — prints to server log (development / no-SMTP installs)
 *   NodemailerMailProvider — sends via SMTP using nodemailer
 *
 * The active transport is selected by the
 * `ngdpbase.mail.provider` config key ('console' | 'smtp').
 */

import logger from '../utils/logger.js';
import { emailDomain, redactEmailAddresses } from '../utils/emailForLog.js';

/**
 * An outbound email message.
 */
export interface MailMessage {
  /** Recipient address */
  to: string;
  /** Email subject line */
  subject: string;
  /** Plain-text body */
  text: string;
  /** Optional HTML body */
  html?: string;
}

/**
 * Common interface for all mail transports.
 */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development transport — writes the email to the server log instead of
 * sending it. Useful for local installs where no SMTP server is available.
 * Like every log line, it names the recipient's domain only, and any address
 * in the body is cut to its domain (#1916).
 */
export class ConsoleMailProvider implements MailProvider {
  send(message: MailMessage): Promise<void> {
    logger.info('[ConsoleMailProvider] ── Outbound email ─────────────────────');
    logger.info(`[ConsoleMailProvider] To:      an address at ${emailDomain(message.to)}`);
    logger.info(`[ConsoleMailProvider] Subject: ${message.subject}`);
    logger.info(`[ConsoleMailProvider] Body:\n${redactEmailAddresses(message.text)}`);
    logger.info('[ConsoleMailProvider] ──────────────────────────────────────');
    return Promise.resolve();
  }
}
