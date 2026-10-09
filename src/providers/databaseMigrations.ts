/**
 * The application database's migration ledger (#1536), strictly ascending by
 * id (YYYYMMDDHHMMSS). Each entry is a frozen snapshot of what it did on its
 * date; see `sqliteMigrations.ts`.
 */
import type { Migration } from './sqliteMigrations.js';

const DATABASE_MIGRATIONS: Migration[] = [
  {
    // #1714: scheduled-job state, history, checkpoints and slot locks.
    id: '20261008180000',
    description: 'scheduled jobs: job_state, job_runs, job_checkpoints, job_leases',
    up: (db) => {
      db.exec(`CREATE TABLE job_state (
        job_id TEXT PRIMARY KEY,
        last_slot_done TEXT,
        next_slot TEXT,
        current_run TEXT,
        updated_at TEXT NOT NULL
      )`);
      db.exec(`CREATE TABLE job_runs (
        run_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        record TEXT NOT NULL
      )`);
      db.exec('CREATE INDEX job_runs_by_job ON job_runs (job_id, started_at)');
      db.exec(`CREATE TABLE job_checkpoints (
        job_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (job_id, run_id)
      )`);
      db.exec(`CREATE TABLE job_leases (
        job_id TEXT NOT NULL,
        slot TEXT NOT NULL,
        owner TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (job_id, slot)
      )`);
    }
  },
  {
    // #1715: the schedule a job's slots were computed from, so a rule changed
    // while the server was down is recomputed rather than caught up.
    id: '20261009140000',
    description: 'scheduled jobs: job_state.rule',
    up: (db) => {
      db.exec('ALTER TABLE job_state ADD COLUMN rule TEXT');
    }
  }
];

export default DATABASE_MIGRATIONS;
