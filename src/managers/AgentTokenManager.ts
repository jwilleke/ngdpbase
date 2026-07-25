/**
 * AgentTokenManager — user-delegated agent API tokens (#946).
 *
 * A user mints a short-lived bearer credential for themselves and hands it to
 * an agent. The token is a *delegation of the owner's own authority*: it can
 * never do anything its owner could not already do.
 *
 * Design decisions (recorded on #946):
 *  - **Opaque, not JWT.** A 24-hour credential must be revocable before it
 *    expires; a self-signed JWT cannot be withdrawn.
 *  - **SHA-256, not bcrypt.** The token is 256 bits of uniform randomness, so
 *    there is no dictionary to attack and no work factor is warranted. bcrypt
 *    would only add per-request latency on an endpoint agents hammer.
 *    (Password hashing is a different problem — low-entropy human input.)
 *  - **Persisted, not in-memory.** MagicLinkAuthProvider's in-memory map suits
 *    its 15-minute TTL; at 24 hours a restart would silently invalidate every
 *    live token mid-run.
 *  - **Roles are never stored on the token.** Only `owner` is kept, and
 *    permissions resolve live from the user record at request time — so
 *    demoting or disabling a user immediately weakens every token they hold.
 *  - **Scopes only narrow.** Effective permission is owner ∩ scopes.
 *
 * Store: `<FAST_STORAGE>/tokens/agent-tokens.json`, a map keyed by token id,
 * matching the map-not-array convention of `users.json`.
 */

import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import BaseManager from './BaseManager.js';
import type { BackupData } from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';

/** Prefix — makes a leaked token greppable and scanner-matchable. */
const TOKEN_PREFIX = 'ngdp_at_';
const TOKEN_BYTES = 32;

/** Actions a token may never carry, however privileged its owner (#946 decision 3). */
const FORBIDDEN_SCOPE_PREFIX = 'admin-';

export interface AgentTokenRecord {
  id: string;
  owner: string;
  name: string;
  /** `sha256:<hex>` — never the cleartext */
  hash: string;
  /** Leading characters, kept for display in listings */
  prefix: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

/** A record safe to return over the API — no hash. */
export type AgentTokenPublic = Omit<AgentTokenRecord, 'hash'>;

export interface MintResult {
  /** Cleartext token — returned once, never persisted. */
  token: string;
  record: AgentTokenPublic;
}

interface AgentTokenConfig {
  defaultTtlHours: number;
  maxTtlHours: number;
  maxPerUser: number;
  retentionDays: number;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** Constant-time compare of two equal-length hash strings. */
function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

class AgentTokenManager extends BaseManager {
  private storePath = '';
  private tokens: Map<string, AgentTokenRecord> = new Map();
  private tokenConfig: AgentTokenConfig = {
    defaultTtlHours: 24,
    maxTtlHours: 24,
    maxPerUser: 10,
    retentionDays: 30
  };

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('AgentTokenManager requires ConfigurationManager');
    }

    this.tokenConfig = {
      defaultTtlHours: Number(configManager.getProperty('ngdpbase.auth.agent-token.default-ttl-hours', 24)),
      maxTtlHours: Number(configManager.getProperty('ngdpbase.auth.agent-token.max-ttl-hours', 24)),
      maxPerUser: Number(configManager.getProperty('ngdpbase.auth.agent-token.max-per-user', 10)),
      retentionDays: Number(configManager.getProperty('ngdpbase.auth.agent-token.retention-days', 30))
    };

    const dir = configManager.getResolvedDataPath('ngdpbase.auth.agent-token.directory', './data/tokens');
    this.storePath = path.join(dir, 'agent-tokens.json');

    await fs.mkdir(dir, { recursive: true });
    await this.load();
    await this.purgeExpired();

    logger.info(`🔑 AgentTokenManager initialized (${this.tokens.size} tokens, ttl≤${this.tokenConfig.maxTtlHours}h)`);
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.storePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, AgentTokenRecord>;
      this.tokens = new Map(Object.entries(parsed));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.tokens = new Map();
        return;
      }
      // A corrupt store must not silently become an empty one — that would
      // revoke every live token without anyone noticing.
      logger.error(`[AgentTokenManager] Could not read ${this.storePath}:`, err);
      throw err;
    }
  }

  /** Persist, keeping a timestamped backup like users.json does. */
  private async persist(): Promise<void> {
    const payload = JSON.stringify(Object.fromEntries(this.tokens), null, 2);
    try {
      const existing = await fs.readFile(this.storePath, 'utf8');
      await fs.writeFile(`${this.storePath}.backup-${Date.now()}`, existing, 'utf8');
    } catch {
      /* no prior file — nothing to back up */
    }
    await fs.writeFile(this.storePath, payload, 'utf8');
  }

  /**
   * Mint a token for `owner`.
   * @throws Error with a caller-safe message on validation failure.
   */
  async mint(
    owner: string,
    name: string,
    scopes: string[],
    ttlHours?: number,
    now: number = Date.now()
  ): Promise<MintResult> {
    if (!owner) throw new Error('owner is required');
    if (!name || !name.trim()) throw new Error('A token name is required');

    // An unscoped token is rejected, never treated as unrestricted (#946 decision 4).
    if (!Array.isArray(scopes) || scopes.length === 0) {
      throw new Error('At least one scope is required');
    }

    // admin-* is refused outright rather than warned (#946 decision 3).
    const forbidden = scopes.filter(s => s.startsWith(FORBIDDEN_SCOPE_PREFIX));
    if (forbidden.length > 0) {
      throw new Error(`Tokens cannot carry admin scopes: ${forbidden.join(', ')}`);
    }

    const ttl = ttlHours ?? this.tokenConfig.defaultTtlHours;
    if (!Number.isFinite(ttl) || ttl <= 0) {
      throw new Error('ttlHours must be a positive number');
    }
    if (ttl > this.tokenConfig.maxTtlHours) {
      throw new Error(`ttlHours exceeds the maximum of ${this.tokenConfig.maxTtlHours}`);
    }

    if (this.listForOwner(owner, now).length >= this.tokenConfig.maxPerUser) {
      throw new Error(`Token limit reached (${this.tokenConfig.maxPerUser} live tokens per user)`);
    }

    const secret = randomBytes(TOKEN_BYTES).toString('base64url');
    const token = `${TOKEN_PREFIX}${secret}`;
    const id = `tok_${randomBytes(6).toString('hex')}`;

    const record: AgentTokenRecord = {
      id,
      owner,
      name: name.trim(),
      hash: sha256(token),
      prefix: token.slice(0, TOKEN_PREFIX.length + 4),
      scopes: [...scopes],
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl * 3_600_000).toISOString(),
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null
    };

    this.tokens.set(id, record);
    await this.persist();

    return { token, record: this.toPublic(record) };
  }

  /**
   * Verify a presented cleartext token.
   * Returns the record when valid, else null. Stamps `lastUsedAt`.
   */
  async verify(token: string, now: number = Date.now()): Promise<AgentTokenRecord | null> {
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) return null;

    const presented = sha256(token);
    let match: AgentTokenRecord | null = null;
    for (const record of this.tokens.values()) {
      if (hashEquals(record.hash, presented)) {
        match = record;
        break;
      }
    }
    if (!match) return null;

    if (match.revokedAt) return null;
    if (Date.parse(match.expiresAt) <= now) return null;

    match.lastUsedAt = new Date(now).toISOString();
    // Best-effort — a failed lastUsedAt write must not fail the request.
    try {
      await this.persist();
    } catch (err) {
      logger.warn('[AgentTokenManager] Could not persist lastUsedAt:', err);
    }
    return match;
  }

  /** Live (not expired, not revoked) tokens for an owner. */
  listForOwner(owner: string, now: number = Date.now()): AgentTokenPublic[] {
    return Array.from(this.tokens.values())
      .filter(t => t.owner === owner && this.isLive(t, now))
      .map(t => this.toPublic(t));
  }

  /** Every live token, for admin oversight (#946 open question 1). */
  listAll(now: number = Date.now()): AgentTokenPublic[] {
    return Array.from(this.tokens.values())
      .filter(t => this.isLive(t, now))
      .map(t => this.toPublic(t));
  }

  getById(id: string): AgentTokenPublic | null {
    const record = this.tokens.get(id);
    return record ? this.toPublic(record) : null;
  }

  /**
   * Revoke a token. Effective immediately — verify() reads the store per
   * request, so there is no cache to wait out.
   */
  async revoke(id: string, byUsername: string, now: number = Date.now()): Promise<boolean> {
    const record = this.tokens.get(id);
    if (!record || record.revokedAt) return false;
    record.revokedAt = new Date(now).toISOString();
    record.revokedBy = byUsername;
    await this.persist();
    logger.info(`[AgentTokenManager] Token ${id} (owner=${record.owner}) revoked by ${byUsername}`);
    return true;
  }

  /** Drop expired/revoked records past the retention window. Audit is unaffected. */
  async purgeExpired(now: number = Date.now()): Promise<number> {
    const cutoff = now - this.tokenConfig.retentionDays * 86_400_000;
    let purged = 0;
    for (const [id, record] of this.tokens) {
      const dead = Date.parse(record.expiresAt) <= now || record.revokedAt !== null;
      if (!dead) continue;
      const deadSince = record.revokedAt ? Date.parse(record.revokedAt) : Date.parse(record.expiresAt);
      if (deadSince <= cutoff) {
        this.tokens.delete(id);
        purged++;
      }
    }
    if (purged > 0) {
      await this.persist();
      logger.info(`[AgentTokenManager] Purged ${purged} expired/revoked token record(s)`);
    }
    return purged;
  }

  private isLive(record: AgentTokenRecord, now: number): boolean {
    return record.revokedAt === null && Date.parse(record.expiresAt) > now;
  }

  private toPublic(record: AgentTokenRecord): AgentTokenPublic {
    const publicRecord = { ...record } as Partial<AgentTokenRecord>;
    delete publicRecord.hash;
    return publicRecord as AgentTokenPublic;
  }

  backup(): Promise<BackupData> {
    // Deliberately excludes token hashes — a backup file should not carry
    // material that can be checked against a presented token.
    return Promise.resolve({
      managerName: 'AgentTokenManager',
      data: { count: this.tokens.size },
      timestamp: new Date().toISOString()
    } as unknown as BackupData);
  }
}

export default AgentTokenManager;
