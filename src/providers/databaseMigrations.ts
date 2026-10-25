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
  },
  {
    // #1537: the audit log in the database. `row_id` is the order records were
    // written, which is chain order; `seq` repeats after a chain restart, so
    // it is not the key. `record` is the stamped record exactly as hashed;
    // the other columns are copies of its fields for the indexes. A retention
    // checkpoint holds the seq and hash of the last record it removed, so
    // what remains verifies from it.
    id: '20261022120000',
    description: 'audit log: audit_events, audit_checkpoints',
    up: (db) => {
      db.exec(`CREATE TABLE audit_events (
        row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        seq INTEGER NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        user TEXT,
        actor TEXT,
        owner TEXT,
        resource TEXT,
        action TEXT,
        result TEXT,
        severity TEXT,
        record TEXT NOT NULL
      )`);
      db.exec('CREATE INDEX audit_events_by_time ON audit_events (timestamp)');
      db.exec('CREATE INDEX audit_events_by_type ON audit_events (event_type, timestamp)');
      db.exec('CREATE INDEX audit_events_by_user ON audit_events (user, timestamp)');
      db.exec('CREATE INDEX audit_events_by_actor ON audit_events (actor, timestamp)');
      db.exec('CREATE INDEX audit_events_by_owner ON audit_events (owner, timestamp)');
      db.exec('CREATE INDEX audit_events_by_resource ON audit_events (resource, timestamp)');
      db.exec(`CREATE TABLE audit_checkpoints (
        checkpoint_id INTEGER PRIMARY KEY AUTOINCREMENT,
        through_row INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        hash TEXT NOT NULL,
        removed INTEGER NOT NULL,
        cutoff TEXT NOT NULL,
        retention_days INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`);
    }
  },
  {
    // #2072: requests for review. `details` is the request's JSON, which can
    // be personal: ReviewManager writes rows only while this database is
    // encrypted. A failed handler leaves the row `open`, with `failure` and
    // `failed_at` saying why and when.
    id: '20261025120000',
    description: 'reviews: review_requests',
    up: (db) => {
      db.exec(`CREATE TABLE review_requests (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        handler_id TEXT NOT NULL,
        decide_permission TEXT NOT NULL,
        subject TEXT NOT NULL,
        summary TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL,
        filed_at TEXT NOT NULL,
        filed_by TEXT NOT NULL,
        decided_at TEXT,
        decided_by TEXT,
        note TEXT,
        outcome TEXT,
        failed_at TEXT,
        failure TEXT
      )`);
      db.exec('CREATE INDEX review_requests_by_status ON review_requests (status, filed_at)');
      db.exec('CREATE INDEX review_requests_by_decided ON review_requests (decided_at)');
    }
  }
];

export default DATABASE_MIGRATIONS;
