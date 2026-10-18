/**
 * The database backup's thread (#1723) — see `runOffThread` in sqliteBackup.ts.
 * One job per worker: export or stage, report, exit.
 */
import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';
import { exportDatabasesSync, stageDatabasesSync, type Driver, type WorkerJob } from './sqliteBackup.js';

const job = workerData as WorkerJob;
try {
  const Database = createRequire(import.meta.url)(job.driver) as Driver;
  const result = job.kind === 'export' ? exportDatabasesSync(Database, job.exports, job.backupKey) : stageDatabasesSync(Database, job.stages, job.backupKey);
  parentPort?.postMessage({ ok: true, result });
} catch (err) {
  parentPort?.postMessage({ ok: false, error: (err as Error).message });
}
