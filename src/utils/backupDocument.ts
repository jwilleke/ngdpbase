/**
 * Reading a backup document back (#1563): decrypt it under the backup key
 * (the GCM tag of every record is checked), decompress it, parse it, and
 * check its shape. The one place a document is read: a restore reads it this
 * way, and every backup is read back this way before it counts as one.
 *
 * `verifyBackupOffThread` does it on a worker thread, so a large document is
 * never decrypted, unzipped and parsed on the thread that serves requests.
 */
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { Worker } from 'node:worker_threads';
import { decryptBuffer, isEncryptedBackup } from './backupCrypto.js';
import { BACKUP_KEY_ENV } from './backupKey.js';

const gunzip = promisify(zlib.gunzip);

/** A backup document's shape: what every backup holds at its top level. */
export interface BackupDocument {
  version: string;
  timestamp: string;
  application: string;
  managers: Record<string, unknown>;
}

/** Throws, naming what is missing, when `doc` is not a backup document. */
export function validateBackupDocument(doc: BackupDocument): void {
  if (!doc || typeof doc !== 'object') throw new Error('Invalid backup: not a backup document');
  if (!doc.version) throw new Error('Invalid backup: missing version');
  if (!doc.timestamp) throw new Error('Invalid backup: missing timestamp');
  if (!doc.managers || typeof doc.managers !== 'object') throw new Error('Invalid backup: missing or invalid managers data');
}

/**
 * The document in `bytes`, read as a restore reads it: an encrypted one only
 * under `backupKey`, gzip by its first bytes whatever the name says.
 *
 * @param name - the file's name, for the messages
 * @param options.validate - check the shape (default true)
 */
export async function readBackupDocument(bytes: Buffer, backupKey: string, name: string, options: { validate?: boolean } = {}): Promise<BackupDocument> {
  let plain: Buffer = bytes;
  if (isEncryptedBackup(bytes)) {
    if (!backupKey) throw new Error(`The backup ${name} is encrypted under the backup key, and ${BACKUP_KEY_ENV} is not set`);
    try {
      plain = await decryptBuffer(bytes, backupKey);
    } catch (err) {
      throw new Error(`The backup ${name} could not be read: ${(err as Error).message}`, { cause: err });
    }
  }
  let json: string;
  if (plain[0] === 0x1f && plain[1] === 0x8b) {
    try {
      json = (await gunzip(plain)).toString('utf8');
    } catch (err) {
      throw new Error(`The backup ${name} does not decompress: ${(err as Error).message}`, { cause: err });
    }
  } else {
    json = plain.toString('utf8');
  }
  let doc: BackupDocument;
  try {
    doc = JSON.parse(json) as BackupDocument;
  } catch (err) {
    throw new Error(`The backup ${name} is not a readable document: ${(err as Error).message}`, { cause: err });
  }
  if (options.validate !== false) validateBackupDocument(doc);
  return doc;
}

/** What a read-back found: the document's timestamp and how many manager parts it holds. */
export interface VerifiedBackup {
  timestamp: string;
  managers: number;
}

/** The worker's job: the document's bytes, the key and the name. */
export interface VerifyJob {
  bytes: Uint8Array;
  backupKey: string;
  name: string;
}

/**
 * Read a backup document back on a worker thread (#1563): rejects, naming
 * why, when it does not decrypt (a wrong key, a changed byte, a bad tag), does
 * not decompress, does not parse, or is not a backup document.
 */
export function verifyBackupOffThread(bytes: Buffer, backupKey: string, name: string, timeoutMs: number): Promise<VerifiedBackup> {
  // Compiled, the worker is the .js beside this file. From source (vitest, tsx) it is the .ts, which needs tsx's loader.
  const fromSource = import.meta.url.endsWith('.ts');
  const entry = new URL(fromSource ? './backupVerifyWorker.ts' : './backupVerifyWorker.js', import.meta.url);
  return new Promise((resolve, reject) => {
    const workerData: VerifyJob = { bytes, backupKey, name };
    const worker = new Worker(entry, { workerData, ...(fromSource ? { execArgv: ['--import', 'tsx'] } : {}) });
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      settle(() => reject(new Error(`reading the backup ${name} back did not finish within ${timeoutMs} ms (ngdpbase.backup.verify-timeout-ms)`)));
      void worker.terminate();
    }, timeoutMs);
    worker.once('message', (m: { ok: true; result: VerifiedBackup } | { ok: false; error: string }) => {
      settle(() => (m.ok ? resolve(m.result) : reject(new Error(m.error))));
    });
    worker.once('error', (err: Error) => settle(() => reject(err)));
    worker.once('exit', (code) => settle(() => reject(new Error(`the backup read-back worker exited (code ${code}) without a result`))));
  });
}
