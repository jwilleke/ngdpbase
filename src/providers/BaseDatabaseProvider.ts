/**
 * The application database (#1536): the one connection the row-storing
 * providers share. A database provider opens it under its key, runs the
 * migration ledger, answers for its integrity and closes it.
 * `DatabaseManager` is the only door to it — nothing else opens a handle.
 *
 * Ported from yourPHR (yourphr#617), where it is in production.
 */
import BaseProvider from './BaseProvider.js';

abstract class BaseDatabaseProvider<Handle = unknown> extends BaseProvider {
  /** The open, migrated connection, for the providers built over it. */
  abstract get handle(): Handle;
  abstract integrityOk(): boolean;
  /** Where the data lives and how big it is. */
  abstract storage(): { location: string; sizeBytes: number; encrypted: boolean };
  abstract close(): void;
}

export default BaseDatabaseProvider;
