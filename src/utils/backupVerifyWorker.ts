/**
 * The backup read-back's thread (#1563) — see `verifyBackupOffThread` in
 * backupDocument.ts. One document per worker: read it back, report, exit.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { readBackupDocument, type VerifyJob } from './backupDocument.js';

const job = workerData as VerifyJob;
try {
  const doc = await readBackupDocument(Buffer.from(job.bytes), job.backupKey, job.name);
  parentPort?.postMessage({ ok: true, result: { timestamp: doc.timestamp, managers: Object.keys(doc.managers).length } });
} catch (err) {
  parentPort?.postMessage({ ok: false, error: (err as Error).message });
}
