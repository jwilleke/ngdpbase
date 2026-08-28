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
 *  - **Scopes only narrow.** Effective permission is owner ∩ scopes, enforced
 *    live by ACLManager and UserManager against `viaToken.scopes`.
 *
 * Store: `<FAST_STORAGE>/tokens/agent-tokens.json`, a map keyed by token id,
 * matching the map-not-array convention of `users.json`.
 *
 * ## Correctness rules this file is built around (#1108)
 *
 * A review of the original implementation found seven defects, all of which
 * came back to three rules that were implied but never stated. They are stated
 * here because each was violated by code that read as though it respected them:
 *
 *  1. **The read path does no disk IO.** `verify()` runs on every agent
 *     request. The original stamped `lastUsedAt` and persisted synchronously —
 *     and `persist()` took a timestamped backup copy first, so authenticating
 *     wrote an unbounded pile of hash-bearing files into the token directory.
 *     `lastUsedAt` is now buffered in memory and flushed by the maintenance
 *     timer; backups are taken only on structural change, and are bounded.
 *  2. **An unreadable date means expired, everywhere.** `Date.parse` returns
 *     `NaN` for a malformed value, and `NaN <= now` and `NaN > now` are *both*
 *     false — so `verify()` read a broken `expiresAt` as "not expired" while
 *     `isLive()` read the same value as "not live". The result was a token that
 *     authenticated forever and appeared in no listing, not even an admin's.
 *     Every expiry comparison now goes through `expiryOf()`, which collapses
 *     unparseable to `-Infinity`: unreadable fails closed.
 *  3. **Nothing hands out a live reference to a stored record.** `verify()`
 *     returned the record straight out of the Map — hash included — and
 *     AgentTokenAuthProvider put its `scopes` array into `req.userContext`,
 *     where the ACL layer treats it as the permission ceiling. Anything
 *     downstream holding that array was editing the store. Every exit from this
 *     class is now a copy via `toPublic()`.
 *
 * ## Extraction note
 *
 * The two namespace-bound values live in `CONFIG_PREFIX` and `TOKEN_PREFIX`
 * below. When this class moves into the shared framework package, those are the
 * parameters a derivative supplies — nothing else in the file names the host.
 */

import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import BaseManager from './BaseManager.js';
import type { BackupData } from './BaseManager.js';
import { writeFileAtomic } from '../utils/atomicWrite.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';

/** Configuration namespace. See the extraction note in the file header. */
const CONFIG_PREFIX = 'ngdpbase.auth.agent-token';

/**
 * Prefix — makes a leaked token greppable and scanner-matchable.
 * See the extraction note: a derivative must use its own.
 */
const TOKEN_PREFIX = 'ngdp_at_';
const TOKEN_BYTES = 32;

/** Actions a token may never carry, however privileged its owner (#946 decision 3). */
const FORBIDDEN_SCOPE_PREFIX = 'admin-';

/**
 * Convenience aliases expanded at mint time.
 *
 * Scopes are compared against *action names* (`page-create`, `page-edit`, …)
 * because that is what both permission paths ask for. `page-ingest` reads well
 * in an API call but is not itself an action, so it is expanded and stored in
 * its expanded form — the store always holds real action names.
 *
 * A Map, not an object literal (#1108): scope names arrive from an HTTP body,
 * and a plain object answers `SCOPE_ALIASES['constructor']` with a function
 * inherited from `Object.prototype`. `?? [scope]` never fired for it, and the
 * expansion loop threw `TypeError: function is not iterable` — a user-supplied
 * scope name turning a clean validation error into a 500.
 */
const SCOPE_ALIASES = new Map<string, string[]>([
  ['page-ingest', ['page-create', 'page-edit']]
]);

/** Expand any aliases and de-duplicate, preserving order. */
function expandScopes(scopes: string[]): string[] {
  const out: string[] = [];
  for (const scope of scopes) {
    for (const expanded of SCOPE_ALIASES.get(scope) ?? [scope]) {
      if (!out.includes(expanded)) out.push(expanded);
    }
  }
  return out;
}

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
  sweepIntervalSeconds: number;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** Constant-time compare of two equal-length hash strings. */
function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Expiry as a number, where **unparseable means expired**.
 *
 * The single most important function in this file. `Date.parse('')`,
 * `Date.parse(undefined as never)` and `Date.parse('soon')` all return `NaN`,
 * and every comparison against `NaN` is false — so a naive `<=` reads a broken
 * date as "still valid" and a naive `>` reads the same value as "not live".
 * Collapsing to `-Infinity` makes both readings agree on *expired*, which is
 * the safe direction: the token stops working and stays visible for revocation.
 */
function expiryOf(record: Pick<AgentTokenRecord, 'expiresAt'>): number {
  const parsed = Date.parse(record.expiresAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/**
 * A number from configuration, or the fallback when it is not a usable one.
 *
 * `Number('24h')` is `NaN`, and the original compared `ttl > this.maxTtlHours`
 * directly — so a single typo in a config file did not raise an error, it
 * silently removed the TTL ceiling and let any caller mint a token lasting
 * years. A limit that can be disabled by a typo is not a limit.
 */
function boundedNumber(value: unknown, fallback: number, key: string, min: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) {
    if (value !== undefined && value !== null) {
      // JSON.stringify, not String(): the value arrives from a config file and
      // may be an object, which stringifies to a useless "[object Object]" in
      // the one message an operator has to diagnose the typo from.
      logger.warn(`[AgentTokenManager] ${key}=${JSON.stringify(value)} is not a number >= ${min} — using ${fallback}`);
    }
    return fallback;
  }
  return n;
}

/**
 * Does this parsed record carry every field the class relies on?
 *
 * The store was previously `JSON.parse`d and cast, so nothing checked it. A
 * record missing `expiresAt` — a hand edit, a bad migration, a partial write
 * from before writes were atomic — became the immortal invisible token
 * described in the file header. Validation is what makes rule 2 enforceable at
 * the boundary rather than defended at each comparison.
 */
function isWellFormed(value: unknown): value is AgentTokenRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  const str = (v: unknown): boolean => typeof v === 'string' && v.length > 0;
  const nullableStr = (v: unknown): boolean => v === null || typeof v === 'string';
  return (
    str(r.id) &&
    str(r.owner) &&
    str(r.name) &&
    typeof r.hash === 'string' && r.hash.startsWith('sha256:') &&
    typeof r.prefix === 'string' &&
    Array.isArray(r.scopes) && r.scopes.every(s => typeof s === 'string') &&
    str(r.createdAt) &&
    str(r.expiresAt) && !Number.isNaN(Date.parse(r.expiresAt as string)) &&
    nullableStr(r.lastUsedAt) &&
    nullableStr(r.revokedAt) &&
    nullableStr(r.revokedBy)
  );
}

class AgentTokenManager extends BaseManager {
  private storePath = '';
  private tokens: Map<string, AgentTokenRecord> = new Map();

  /**
   * Records that failed validation on load, kept verbatim and written back.
   *
   * They are deliberately NOT in `tokens`, so they authenticate nothing and
   * appear in no listing. But dropping them would rewrite the store without
   * them on the next save — destroying the only evidence that something
   * corrupted the file. Fail closed, keep the evidence, stay up.
   */
  private quarantined: Map<string, unknown> = new Map();

  /** Ids whose `lastUsedAt` has moved in memory but not yet on disk. */
  private dirtyLastUsed: Set<string> = new Set();

  /**
   * Serialises saves. `writeFileAtomic` guarantees no *partial* file, and says
   * so in its own header — it is explicitly not a lock, and two concurrent
   * writers still race for last-writer-wins. This is the queue the page index
   * uses for the same reason.
   */
  private writeQueue: Promise<void> = Promise.resolve();

  private maintenanceTimer: NodeJS.Timeout | null = null;

  private tokenConfig: AgentTokenConfig = {
    defaultTtlHours: 24,
    maxTtlHours: 24,
    maxPerUser: 10,
    retentionDays: 30,
    sweepIntervalSeconds: 60
  };

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('AgentTokenManager requires ConfigurationManager');
    }

    // #1110: validate against what a setting MEANS, not a blanket positivity
    // check. An interval or a TTL has no meaningful zero — a zero TTL mints a
    // token already expired, a zero interval is a busy loop. A count or a
    // retention window does: `retention-days: 0` means purge as soon as dead,
    // `max-per-user: 0` means allow none. Rejecting those told the operator
    // their deliberate value "is not a positive number" and silently used the
    // default instead.
    const positive = (key: string, fallback: number): number =>
      boundedNumber(configManager.getProperty(`${CONFIG_PREFIX}.${key}`, fallback), fallback, `${CONFIG_PREFIX}.${key}`, 1);
    const count = (key: string, fallback: number): number =>
      boundedNumber(configManager.getProperty(`${CONFIG_PREFIX}.${key}`, fallback), fallback, `${CONFIG_PREFIX}.${key}`, 0);

    this.tokenConfig = {
      defaultTtlHours: positive('default-ttl-hours', 24),
      maxTtlHours: positive('max-ttl-hours', 24),
      maxPerUser: count('max-per-user', 10),
      retentionDays: count('retention-days', 30),
      sweepIntervalSeconds: positive('sweep-interval-seconds', 60)
    };

    const dir = configManager.getResolvedDataPath(`${CONFIG_PREFIX}.directory`, './data/tokens');
    this.storePath = path.join(dir, 'agent-tokens.json');

    await fs.mkdir(dir, { recursive: true });
    await this.load();
    await this.purgeExpired();
    this.startMaintenance();

    logger.info(`🔑 AgentTokenManager initialized (${this.tokens.size} tokens, ttl≤${this.tokenConfig.maxTtlHours}h)`);
  }

  /**
   * Flush buffered `lastUsedAt` stamps and purge dead records, on a timer.
   *
   * Purging used to happen only in `initialize()`, so a server up for months
   * never applied its own retention policy again — the config promised a
   * 30-day window that was only ever honoured at boot.
   *
   * `unref()` so this never holds the process open: a maintenance tick is not a
   * reason for node to stay alive, and a test that forgets to shut a manager
   * down should still exit.
   */
  private startMaintenance(): void {
    if (this.maintenanceTimer) return;
    const everyMs = this.tokenConfig.sweepIntervalSeconds * 1000;
    this.maintenanceTimer = setInterval(() => {
      void (async () => {
        try {
          await this.flushLastUsed();
          await this.purgeExpired();
        } catch (err) {
          logger.warn('[AgentTokenManager] Maintenance tick failed:', err);
        }
      })();
    }, everyMs);
    this.maintenanceTimer.unref?.();
  }

  private async load(): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(this.storePath, 'utf8');
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

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    this.tokens = new Map();
    this.quarantined = new Map();
    for (const [id, record] of Object.entries(parsed)) {
      if (isWellFormed(record)) {
        this.tokens.set(id, record);
      } else {
        this.quarantined.set(id, record);
      }
    }

    if (this.quarantined.size > 0) {
      // Loud, and at error level: a malformed record in a credential store is
      // either corruption or tampering, and both want a human.
      logger.error(
        `[AgentTokenManager] ${this.quarantined.size} malformed record(s) in ${this.storePath} ` +
        `— quarantined (they authenticate nothing and are kept on disk): ${[...this.quarantined.keys()].join(', ')}`
      );
    }
  }

  /**
   * Persist the store atomically, serialised behind the write queue.
   *
   * Quarantined records are written back untouched so a save never destroys
   * evidence of corruption.
   */
  private persist(): Promise<void> {
    const payload = JSON.stringify(
      { ...Object.fromEntries(this.tokens), ...Object.fromEntries(this.quarantined) },
      null,
      2
    );
    // #1110: the caller sees its own failure; the QUEUE must not inherit it.
    // `writeQueue = writeQueue.then(fn)` supplies only a fulfilled handler, so
    // one rejection left the stored chain permanently rejected: every later
    // persist chained off it, never ran, and reported the stale original error.
    // One second of a full volume and nothing was written again until restart.
    const next = this.writeQueue.then(() => writeFileAtomic(this.storePath, payload, 'utf8'));
    this.writeQueue = next.catch(() => {});
    return next;
  }

  /**
   * Write out buffered `lastUsedAt` stamps, if any.
   *
   * Public so a caller — a test, or a shutdown path — can make the in-memory
   * stamp durable on demand without waiting for the maintenance tick.
   */
  async flushLastUsed(): Promise<number> {
    if (this.dirtyLastUsed.size === 0) return 0;
    const count = this.dirtyLastUsed.size;
    this.dirtyLastUsed.clear();
    await this.persist();
    return count;
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
    // Scopes arrive from a request body. A non-string here would be stored and
    // then match no action for the life of the token — a credential that fails
    // silently rather than at the point of the mistake.
    if (!scopes.every(s => typeof s === 'string' && s.trim().length > 0)) {
      throw new Error('Every scope must be a non-empty string');
    }

    const effectiveScopes = expandScopes(scopes);

    // admin-* is refused outright rather than warned (#946 decision 3).
    // Checked after expansion so an alias can never smuggle one in.
    const forbidden = effectiveScopes.filter(s => s.startsWith(FORBIDDEN_SCOPE_PREFIX));
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
      scopes: effectiveScopes,
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
   * Returns a COPY of the record when valid, else null. Buffers `lastUsedAt`.
   *
   * No disk IO: see rule 1 in the file header. The stamp lands in memory and is
   * flushed by the maintenance tick, so a token used a thousand times a minute
   * costs one write, not a thousand writes and a thousand backup files.
   */
  async verify(token: string, now: number = Date.now()): Promise<AgentTokenPublic | null> {
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
    if (expiryOf(match) <= now) return null;

    match.lastUsedAt = new Date(now).toISOString();
    this.dirtyLastUsed.add(match.id);
    return this.toPublic(match);
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
   * Revoke a token. Effective immediately — verify() reads the in-memory store
   * per request, so there is no cache to wait out.
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
      const expiry = expiryOf(record);
      const dead = expiry <= now || record.revokedAt !== null;
      if (!dead) continue;
      const revokedAtMs = record.revokedAt ? Date.parse(record.revokedAt) : Number.NaN;
      const deadSince = Number.isNaN(revokedAtMs) ? expiry : revokedAtMs;
      if (deadSince <= cutoff) {
        this.tokens.delete(id);
        this.dirtyLastUsed.delete(id);
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
    return record.revokedAt === null && expiryOf(record) > now;
  }

  /**
   * A copy safe to hand out: no hash, and its own `scopes` array.
   *
   * The array copy is the load-bearing half. `scopes` becomes the permission
   * ceiling in `req.userContext.viaToken`, so sharing the stored array with a
   * caller means anything downstream can widen a token's authority in place.
   */
  private toPublic(record: AgentTokenRecord): AgentTokenPublic {
    const { hash: _hash, ...rest } = record;
    return { ...rest, scopes: [...record.scopes] };
  }

  /**
   * Flush pending stamps and stop the maintenance timer.
   *
   * Without this, `lastUsedAt` movement since the last tick is lost on a clean
   * shutdown — and the timer would keep a reference to a dead manager.
   */
  async shutdown(): Promise<void> {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
    try {
      await this.flushLastUsed();
    } catch (err) {
      logger.warn('[AgentTokenManager] Could not flush lastUsedAt on shutdown:', err);
    }
    // #1110: flushLastUsed() returns immediately when nothing is dirty, so it
    // never touches the queue. A revoke whose write had not landed was lost on
    // SIGTERM — app.ts awaits engine.shutdown() and then exits — and the token
    // was live again after restart, which is exactly the durability this method
    // claims to provide.
    await this.writeQueue.catch(() => {});
    await super.shutdown();
  }

  async backup(): Promise<BackupData> {
    // Token hashes are deliberately excluded — a backup file should not carry
    // material that can be checked against a presented token. The consequence
    // is stated rather than left to be discovered: this backup CANNOT restore
    // working tokens, and a restore leaves every agent needing a fresh mint.
    // What it does preserve is the audit trail of what existed.
    return {
      managerName: 'AgentTokenManager',
      timestamp: new Date().toISOString(),
      data: {
        restorable: false,
        count: this.tokens.size,
        tokens: this.listAll()
      }
    };
  }
}

export default AgentTokenManager;
