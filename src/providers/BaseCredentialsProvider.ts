/**
 * The credentials store (#1524): an account's ways in beyond its password.
 *
 * Passwords stay on the user record and are never copied here (decided
 * 2026-10-02). This store holds passkeys, verified email / phone addresses
 * and known devices (TOTP seeds once #421 is built) — one row each, many per
 * account.
 *
 * Every row is signed with `NGDPBASE_CREDENTIALS_KEY` (the instance `.env`).
 * A row that does not verify is never returned: a planted row is ignored, and
 * reported through `onRejected` so the owner of the store raises the alert.
 *
 * AuthManager is the only door; nothing else reads or writes a provider.
 */
import BaseProvider from './BaseProvider.js';

/** The environment variable holding the signing and encryption key. */
export const CREDENTIALS_KEY_ENV = 'NGDPBASE_CREDENTIALS_KEY';

export type CredentialKind = 'passkey' | 'totp' | 'email' | 'sms' | 'device';

export const CREDENTIAL_KINDS: readonly CredentialKind[] = ['passkey', 'totp', 'email', 'sms', 'device'];

/** One credential, as stored. */
export interface CredentialRecord {
  id: string;
  username: string;
  kind: CredentialKind;
  /** What identifies it within its kind: a passkey's credential id, an address, a device token's hash. */
  subject: string;
  /** Kind-specific: a public key and counter, or empty (an encrypted TOTP seed once #421 is built). */
  secret: string;
  /** What the person calls it — "Jim's iPhone". */
  label: string;
  /** RFC 3339 with offset. */
  createdAt: string;
  lastUsedAt?: string;
}

/** Why a stored row was refused. */
export interface RejectedCredential {
  /** What could be read of it — never trusted, only reported. */
  row: Partial<CredentialRecord>;
  reason: 'bad-signature' | 'unsigned' | 'malformed';
}

abstract class BaseCredentialsProvider extends BaseProvider {
  /** Load the store. Rows that fail verification are dropped and reported. */
  abstract initialize(onRejected: (rejected: RejectedCredential[]) => void): Promise<void>;

  /** A person's verified credentials, oldest first. */
  abstract list(username: string): CredentialRecord[];

  abstract get(id: string): CredentialRecord | null;

  /** Add a row; refuses a second row with the same kind and subject. */
  abstract add(record: CredentialRecord): Promise<void>;

  /** Remove a row; returns whether it existed. */
  abstract remove(id: string): Promise<boolean>;

  /** The row with this kind and subject, which are unique together; null when none. */
  abstract findBySubject(kind: CredentialKind, subject: string): CredentialRecord | null;

  /** Record that a credential was just used, and its new secret when that changes (a passkey's counter). */
  abstract touch(id: string, at: string, secret?: string): Promise<void>;

  /** Change a row's display name; the row is re-signed. False when there is no such row. */
  abstract relabel(id: string, label: string): Promise<boolean>;

  /** Where it is kept, for the admin view. */
  abstract location(): string;
}

export default BaseCredentialsProvider;
