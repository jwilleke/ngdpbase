/**
 * NodemailerMailProvider — SMTP mail transport using nodemailer.
 *
 * Configure via app-custom-config.json:
 *   ngdpbase.mail.provider.smtp.host
 *   ngdpbase.mail.provider.smtp.port
 *   ngdpbase.mail.provider.smtp.secure
 *   ngdpbase.mail.provider.smtp.user
 *   ngdpbase.mail.provider.smtp.pass
 *   ngdpbase.mail.provider.smtp.from
 */

import nodemailer from 'nodemailer';
import { describeAttachments, type MailMessage, type MailProvider } from './MailProvider.js';
import logger from '../utils/logger.js';
import { emailDomain } from '../utils/emailForLog.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export class NodemailerMailProvider implements MailProvider {
  private transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor(private config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user && config.pass
        ? { auth: { user: config.user, pass: config.pass } }
        : {})
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.attachments?.length
        ? { attachments: message.attachments.map(({ filename, contentType, content }) => ({ filename, contentType, content })) }
        : {})
    });
    logger.info(`[NodemailerMailProvider] Sent email to-domain=${emailDomain(message.to)}${describeAttachments(message.attachments)}: ${message.subject}`);
  }
}
