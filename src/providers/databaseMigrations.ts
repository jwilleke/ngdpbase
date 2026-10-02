/**
 * The application database's migration ledger (#1536), strictly ascending by
 * id (YYYYMMDDHHMMSS). Each entry is a frozen snapshot of what it did on its
 * date; see `sqliteMigrations.ts`. Empty until the first row-storing provider
 * lands (#1537, DatabaseAuditProvider).
 */
import type { Migration } from './sqliteMigrations.js';

const DATABASE_MIGRATIONS: Migration[] = [];

export default DATABASE_MIGRATIONS;
