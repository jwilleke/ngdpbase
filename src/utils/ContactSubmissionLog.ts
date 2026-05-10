/**
 * ContactSubmissionLog — append-only JSONL audit log for /contact submissions
 * (#670 Phase C, v3.12.0).
 *
 * One entry per legitimate POST /contact attempt — one JSON object per line.
 * Survives mail failure: every submission that gets past honeypot + rate limit
 * is recorded, regardless of whether the eventual `sendTo` call succeeds.
 * Rate-limited (429) and honeypot-triggered submissions are NOT persisted —
 * they're already in the warn log and would otherwise inflate the audit file.
 *
 * Failures to append are logged at error level but do NOT throw; persistence
 * is best-effort and must never block the response on the visitor-facing path.
 *
 * The default file path is `{instanceDataFolder}/contact-submissions.log`.
 * No rotation, no max-size cap, no compression — keep it simple for v1. If
 * the file grows large, rotate it externally (logrotate, etc.).
 */

import fs from 'fs/promises';
import path from 'path';
import logger from './logger.js';

export type MailResult =
  | 'sent'
  | 'mail-failed'
  | 'mail-disabled'
  | 'no-recipient';

export interface SubmissionEntry {
  /** ISO 8601 UTC timestamp of when the entry was recorded. */
  ts: string;
  /** Source IP — `req.ip`, may be `null` if Express couldn't resolve it. */
  ip: string | null;
  /** User-Agent header, trimmed; `null` if missing. */
  userAgent: string | null;
  /** Referer header, trimmed; `null` if missing. */
  referer: string | null;
  /** Visitor's submitted name (post-trim, may be empty if mail check ran before validation). */
  name: string;
  /** Visitor's submitted email (post-trim, possibly malformed if mail check ran before validation). */
  email: string;
  /** Visitor's submitted subject (post-trim). */
  subject: string;
  /** Visitor's submitted message (post-trim). */
  message: string;
  /** Resolved recipient address, or `null` if recipient resolution did not run / returned null. */
  recipient: string | null;
  /** Outcome of the submission attempt. */
  mailResult: MailResult;
}

export class ContactSubmissionLog {
  constructor(private readonly filePath: string) {}

  /** Append a single entry as one JSON line. Best-effort — never throws. */
  async append(entry: SubmissionEntry): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.filePath, line, 'utf8');
    } catch (err: unknown) {
      logger.error(
        `[ContactSubmissionLog] failed to append to ${this.filePath}:`,
        err
      );
      // Do NOT rethrow — persistence failure must not block the response.
    }
  }
}
