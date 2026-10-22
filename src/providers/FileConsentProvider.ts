/**
 * Consent records on disk (#1603): one append-only file per account,
 * `<storagedir>/<username>.jsonl`, one JSON record per line.
 *
 * - Append only: an acceptance adds a line and nothing is rewritten, so the
 *   file is the history of what the person accepted. The only other change
 *   is removing the whole file, when the account is deleted.
 * - Owner-only (`0600` in a `0700` folder, #1560): a record names a person,
 *   what they agreed to and from where.
 * - Each line is written and flushed to the device before the call returns,
 *   so an acceptance the person was told about is on disk.
 *
 * ConsentManager is the only caller. It decides who may write what; this
 * stores and reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ensureSecretDir, secureExistingSecretFile, SECRET_FILE_MODE } from '../utils/secretFileMode.js';
import logger from '../utils/logger.js';
import type { ConsentRecord } from '../types/Consent.js';

class FileConsentProvider {
  constructor(private readonly dir: string) {}

  /** Create the folder owner-only; tighten one that is wider. */
  initialize(): void {
    const warning = ensureSecretDir(this.dir);
    if (warning) logger.warn(`[FileConsentProvider] ${warning}`);
  }

  /** The folder the records live in: what a backup copies. */
  get directory(): string {
    return this.dir;
  }

  /** One file per account, named by the account's stored username. */
  private fileFor(username: string): string {
    if (!username) throw new Error('A consent record needs an account');
    return path.join(this.dir, `${encodeURIComponent(username)}.jsonl`);
  }

  /** Every record of `username`, oldest first; none when the file does not exist. Unreadable lines are reported and skipped. */
  async list(username: string): Promise<ConsentRecord[]> {
    const file = this.fileFor(username);
    let text: string;
    try {
      const tightened = secureExistingSecretFile(file);
      if (tightened) logger.warn(tightened);
      text = await fs.promises.readFile(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const records: ConsentRecord[] = [];
    for (const [i, line] of text.split('\n').entries()) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as ConsentRecord);
      } catch {
        logger.error(`[FileConsentProvider] ${file} line ${i + 1} is not a record; it is skipped`);
      }
    }
    return records;
  }

  /** Add one record to `username`'s file, flushed to the device before returning. */
  async append(username: string, record: ConsentRecord): Promise<void> {
    const handle = await fs.promises.open(this.fileFor(username), 'a', SECRET_FILE_MODE);
    try {
      await handle.write(`${JSON.stringify(record)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  /** Remove `username`'s file (the account was deleted). True when there was one. */
  async remove(username: string): Promise<boolean> {
    try {
      await fs.promises.unlink(this.fileFor(username));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }
}

export default FileConsentProvider;
