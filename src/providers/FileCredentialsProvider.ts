/**
 * The credentials store as one JSON file beside the user store (#1524),
 * `${FAST_STORAGE}/users/credentials.json` by default.
 *
 * - Written owner-only (`0600`) through the atomic save, so the file is never
 *   readable by other local accounts, not even mid-write (#1560).
 * - Every row carries `sig`: HMAC-SHA-256 over its fields in a fixed order,
 *   keyed by `NGDPBASE_CREDENTIALS_KEY`. On load a row whose signature is
 *   missing or wrong is dropped and reported; it can never sign anyone in.
 * - Nothing here is a password hash. Public keys, (when TOTP is built, #421, encrypted seeds) and token
 *   hashes are low value to a reader; a writer is what signing stops.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'fs-extra';
import path from 'node:path';
import BaseCredentialsProvider, {
  CREDENTIAL_KINDS,
  type CredentialRecord,
  type RejectedCredential
} from './BaseCredentialsProvider.js';
import type { ProviderDurability } from './BaseProvider.js';
import { writeFileAtomic } from '../utils/atomicWrite.js';
import { secureExistingSecretFile } from '../utils/secretFileMode.js';
import logger from '../utils/logger.js';

interface StoredFile {
  version: 1;
  rows: Array<CredentialRecord & { sig?: string }>;
}

/** The signed fields, in a fixed order, so a signature never depends on key order in the file. */
function canonical(r: CredentialRecord): string {
  return JSON.stringify([r.id, r.username, r.kind, r.subject, r.secret, r.label, r.createdAt, r.lastUsedAt ?? null]);
}

function isRecord(r: unknown): r is CredentialRecord {
  const o = r as Record<string, unknown>;
  return typeof o === 'object' && o !== null &&
    ['id', 'username', 'subject', 'secret', 'label', 'createdAt'].every(k => typeof o[k] === 'string') &&
    CREDENTIAL_KINDS.includes(o.kind as CredentialRecord['kind']) &&
    (o.lastUsedAt === undefined || typeof o.lastUsedAt === 'string');
}

class FileCredentialsProvider extends BaseCredentialsProvider {
  protected override providerName = 'FileCredentialsProvider';
  protected override providerDescription = 'Signed JSON credentials store beside the user store';
  private rows = new Map<string, CredentialRecord>();

  /**
   * @param file the store; created on first write
   * @param key  `NGDPBASE_CREDENTIALS_KEY`; refused when empty
   */
  constructor(private readonly file: string, private readonly key: string) {
    super();
    if (!key) throw new Error('The credentials store needs NGDPBASE_CREDENTIALS_KEY (#1524)');
  }

  private sign(r: CredentialRecord): string {
    return createHmac('sha256', this.key).update(canonical(r)).digest('base64');
  }

  private verifies(r: CredentialRecord, sig: string): boolean {
    const expected = Buffer.from(this.sign(r));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async initialize(onRejected: (rejected: RejectedCredential[]) => void): Promise<void> {
    this.rows.clear();
    if (!(await fs.pathExists(this.file))) return;
    const tightened = secureExistingSecretFile(this.file); // #1560
    if (tightened) logger.warn(tightened);
    const parsed = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<StoredFile>;
    const rejected: RejectedCredential[] = [];
    for (const raw of Array.isArray(parsed.rows) ? parsed.rows : []) {
      const { sig, ...fields } = raw as CredentialRecord & { sig?: unknown };
      if (!isRecord(fields)) {
        rejected.push({ row: fields, reason: 'malformed' });
      } else if (typeof sig !== 'string' || sig === '') {
        rejected.push({ row: fields, reason: 'unsigned' });
      } else if (!this.verifies(fields, sig)) {
        rejected.push({ row: fields, reason: 'bad-signature' });
      } else {
        this.rows.set(fields.id, fields);
      }
    }
    if (rejected.length > 0) onRejected(rejected);
  }

  list(username: string): CredentialRecord[] {
    return [...this.rows.values()]
      .filter(r => r.username === username)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(id: string): CredentialRecord | null {
    return this.rows.get(id) ?? null;
  }

  async add(record: CredentialRecord): Promise<void> {
    if (!isRecord(record)) throw new Error('Not a credential record (#1524)');
    if (this.rows.has(record.id)) throw new Error(`Credential ${record.id} already exists`);
    for (const r of this.rows.values()) {
      if (r.kind === record.kind && r.subject === record.subject) {
        throw new Error(`A ${record.kind} credential with that subject is already enrolled`);
      }
    }
    this.rows.set(record.id, { ...record });
    await this.save();
  }

  async remove(id: string): Promise<boolean> {
    if (!this.rows.delete(id)) return false;
    await this.save();
    return true;
  }

  findBySubject(kind: CredentialRecord['kind'], subject: string): CredentialRecord | null {
    for (const r of this.rows.values()) if (r.kind === kind && r.subject === subject) return r;
    return null;
  }

  async touch(id: string, at: string, secret?: string): Promise<void> {
    const r = this.rows.get(id);
    if (!r) return;
    r.lastUsedAt = at;
    if (secret !== undefined) r.secret = secret;
    await this.save();
  }

  async relabel(id: string, label: string): Promise<boolean> {
    const r = this.rows.get(id);
    if (!r) return false;
    r.label = label;
    await this.save();
    return true;
  }

  location(): string {
    return this.file;
  }

  override getDurability(): ProviderDurability {
    return { bufferedForMs: 0, bufferedRecords: 0, fsync: true };
  }

  private async save(): Promise<void> {
    const out: StoredFile = { version: 1, rows: [...this.rows.values()].map(r => ({ ...r, sig: this.sign(r) })) };
    await fs.ensureDir(path.dirname(this.file), { mode: 0o700 });
    await writeFileAtomic(this.file, JSON.stringify(out, null, 2), 'utf8', { fsync: true, mode: 0o600 });
  }
}

export default FileCredentialsProvider;
