/**
 * ConsentManager — what each person has accepted, and asking them (#1603).
 *
 * It owns two things and asks for everything else:
 *
 * - __The records.__ One append-only file per account
 *   (`ngdpbase.consent.storagedir`, `FileConsentProvider`), owner-only: which
 *   document, which version, its effective date, when, and who and how.
 * - __The prompts.__ Which documents a person still has to accept: core's
 *   (`ngdpbase.consent.documents`, asked at sign-up and at an interactive
 *   sign-in) and each add-on's (asked before its per-person switch turns on,
 *   and again on a version change when the person next uses it).
 *
 * The documents themselves are pages, read when asked (`version:` and
 * `effective:` front matter), never copied. Whether a person has accepted
 * the current version is derived each time from their records and the page,
 * so a version change "clears" everyone's acceptance without touching a
 * record. Per-use consents — apps approved through `/oidc`, share links —
 * stay with their owners (OidcManager, ShareManager).
 *
 * Only the person accepts, for themselves: never a token, a share or a proxy
 * acting for them, and never an administrator on their behalf. Each
 * acceptance is recorded in the audit log (`consent-grant`, on-failure
 * refuse) before it is stored.
 */
import BaseManager, { type BackupFolder } from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import FileConsentProvider from '../providers/FileConsentProvider.js';
import { actorOf, isJobContext, type ActorContext } from '../context/ActorContext.js';
import { toPermissionSubject } from '../context/JobContext.js';
import { systemContext } from '../context/bootActions.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import {
  CORE_CONSENT_SCOPE,
  type AddonConsentRegistration,
  type ConsentDocument,
  type ConsentRecord,
  type ConsentScope,
  type ConsentSeen,
  type ConsentStatus
} from '../types/Consent.js';

export const CONSENT_DOCUMENTS_KEY = 'ngdpbase.consent.documents';
const CONSENT_STORAGE_KEY = 'ngdpbase.consent.storagedir';
const DEFAULT_DOCUMENTS = ['terms-of-service', 'privacy-policy'];

/** Refused: not this person, not signed in themselves, or not allowed. Nothing was recorded. */
export class ConsentRefusedError extends Error {
  override readonly name = 'ConsentRefusedError';
}

/** A document changed (or appeared) after the person was shown it; show it again. Nothing was recorded. */
export class ConsentChangedError extends Error {
  override readonly name = 'ConsentChangedError';
}

/** The documents of one scope with this person's state, for "Your consents". */
export interface ConsentScopeStatus {
  scope: ConsentScope;
  statuses: ConsentStatus[];
}

interface PageMetadataReader {
  getPageMetadata(identifier: string, ctx: ActorContext): Promise<Record<string, unknown> | null>;
}

interface AccountReader {
  getUser(username: string): Promise<{ username?: string; createdAt?: string; isActive?: boolean } | null | undefined>;
}

/** `version:` as a string; empty when the page names none. */
function versionOf(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim() : '';
}

/** `effective:` as `YYYY-MM-DD` (YAML reads a bare date as a Date), or null. */
function effectiveOf(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

/** A path prefix an add-on serves, normalised: leading slash, no trailing one. */
function normalisePrefix(prefix: string): string {
  const p = `/${prefix.trim().replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return p === '/' ? '' : p;
}

class ConsentManager extends BaseManager {
  readonly description = 'What each person has accepted — core\'s terms and add-ons\' documents — and asking them (#1603)';

  private provider: FileConsentProvider | null = null;
  private storageDir: string | null = null;
  /** Add-on slug → its documents and the paths it is used at, registered at load. */
  private readonly addons = new Map<string, { documents: string[]; paths: string[] }>();
  /** Username → their records, read once and dropped on every write. */
  private readonly cache = new Map<string, ConsentRecord[]>();
  /** Document id → why it cannot be asked for; the needs-attention reason is made from these. */
  private readonly problems = new Map<string, string>();
  private attentionReason: string | null = null;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);
    const dir = this.configuredStorageDir();
    this.storageDir = dir;
    if (!dir || !this.preflightConfiguredPath(CONSENT_STORAGE_KEY, dir).ok) {
      logger.warn('[ConsentManager] no usable consent folder: nobody is asked to accept anything until it is fixed');
      return;
    }
    this.provider = new FileConsentProvider(dir);
    this.provider.initialize();
    logger.info(`📜 ConsentManager initialized (${dir})`);
  }

  private configuredStorageDir(): string | null {
    return this.engine.getManager<ConfigurationManager>('ConfigurationManager')
      ?.getResolvedDataPath(CONSENT_STORAGE_KEY, './data/consent') ?? null;
  }

  /** The consent records folder is in the backup (#1985); a backup from before #1603 has none, so it is optional. */
  override backupFolders(): BackupFolder[] {
    return [{ part: 'consent', folder: this.storageDir ?? this.configuredStorageDir(), optional: true }];
  }

  // ── Documents ──────────────────────────────────────────────────────────

  /**
   * An add-on's documents (#1603), registered from its `register()`. Each id
   * must start `<slug>-`, so an add-on can never register core's documents or
   * another add-on's; the add-on must be per-person (`perPerson: true`),
   * since its documents are accepted when a person turns it on. Registering
   * twice replaces the first.
   */
  registerAddonDocuments(slug: string, registration: AddonConsentRegistration): void {
    const addons = this.engine.getManager<{ isPerPerson?(s: string): boolean }>('AddonsManager');
    if (!addons?.isPerPerson?.(slug)) {
      throw new Error(`Add-on '${slug}' is not per-person, so it has no switch for its documents to guard (set "perPerson": true in the "ngdpbase" block of its package.json)`);
    }
    const documents = Array.isArray(registration?.documents) ? registration.documents : [];
    if (documents.length === 0) throw new Error(`Add-on '${slug}' registered no documents`);
    for (const id of documents) {
      if (typeof id !== 'string' || !id.startsWith(`${slug}-`) || id.length <= slug.length + 1) {
        throw new Error(`Add-on '${slug}' may register only documents named '${slug}-…', not '${String(id)}'`);
      }
    }
    const paths = (Array.isArray(registration.paths) ? registration.paths : [])
      .filter((p): p is string => typeof p === 'string')
      .map(normalisePrefix)
      .filter((p) => p !== '');
    this.addons.set(slug, { documents: [...documents], paths });
    logger.info(`📜 [ConsentManager] ${slug} registered ${documents.join(', ')}${paths.length ? ` (asked at ${paths.join(', ')})` : ''}`);
  }

  /** The add-ons that registered documents, in registration order. */
  registeredAddons(): string[] {
    return [...this.addons.keys()];
  }

  /** The add-on whose registered path `path` is under, or null. */
  addonForPath(path: string): string | null {
    for (const [slug, { paths }] of this.addons) {
      if (paths.some((p) => path === p || path.startsWith(`${p}/`))) return slug;
    }
    return null;
  }

  /** Every document id a person may be asked to accept, core's and every add-on's: the pages that stay readable while they are asked. */
  allDocumentIds(): string[] {
    return [...this.documentIds(CORE_CONSENT_SCOPE), ...[...this.addons.values()].flatMap((a) => a.documents)];
  }

  private documentIds(scope: ConsentScope): string[] {
    if (scope === CORE_CONSENT_SCOPE) {
      const configured = this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty(CONSENT_DOCUMENTS_KEY, DEFAULT_DOCUMENTS);
      return Array.isArray(configured) ? configured.filter((d): d is string => typeof d === 'string' && d.trim() !== '') : [];
    }
    return this.addons.get(scope)?.documents ?? [];
  }

  /**
   * The documents of `scope` as they stand now. A page that is missing, or
   * has no `version:`, is left out — nobody is asked for it, nothing is
   * blocked — and ConsentManager needs attention until it is back.
   */
  async documents(scope: ConsentScope = CORE_CONSENT_SCOPE): Promise<ConsentDocument[]> {
    const docs: ConsentDocument[] = [];
    for (const id of this.documentIds(scope)) {
      const doc = await this.readDocument(id, scope);
      if (doc) docs.push(doc);
    }
    this.reportProblems();
    return docs;
  }

  private async readDocument(id: string, scope: ConsentScope): Promise<ConsentDocument | null> {
    const pages = this.engine.getManager<PageMetadataReader>('PageManager');
    let meta: Record<string, unknown> | null = null;
    try {
      meta = pages ? await pages.getPageMetadata(id, systemContext(this.engine, 'read a document people are asked to accept (#1603)')) : null;
    } catch (err) {
      logger.warn(`[ConsentManager] could not read the page '${id}': ${(err as Error).message}`);
    }
    const whose = scope === CORE_CONSENT_SCOPE ? '' : ` (${scope})`;
    if (!meta) {
      this.problems.set(id, `No '${id}' page${whose}: nobody is asked to accept it. Restore it (Admin → Required Pages Sync for core's) or remove it from ${scope === CORE_CONSENT_SCOPE ? CONSENT_DOCUMENTS_KEY : 'the add-on\'s registration'}.`);
      return null;
    }
    const version = versionOf(meta['version']);
    if (!version) {
      this.problems.set(id, `The '${id}' page${whose} has no version: in its front matter, so nobody is asked to accept it.`);
      return null;
    }
    this.problems.delete(id);
    return {
      id,
      scope,
      title: typeof meta['title'] === 'string' && meta['title'] ? meta['title'] : id,
      version,
      effective: effectiveOf(meta['effective'])
    };
  }

  /** Needs attention while any document cannot be asked for; ready again once none is (warn, never force). */
  private reportProblems(): void {
    const reason = this.problems.size > 0 ? [...this.problems.values()].join(' ') : null;
    if (reason === this.attentionReason) return;
    if (reason) this.markNeedsAttention(reason, CONSENT_DOCUMENTS_KEY);
    else if (this.attentionReason) this.markReadyIfDegradedBy(this.attentionReason);
    this.attentionReason = reason;
  }

  /** Read every document once, so a missing one shows on the dashboard from start-up. Called after the required pages are seeded. */
  async checkDocuments(): Promise<void> {
    await this.documents(CORE_CONSENT_SCOPE);
    for (const slug of this.addons.keys()) await this.documents(slug);
  }

  // ── Records ────────────────────────────────────────────────────────────

  /**
   * `username`'s records on their current account, oldest first. A record
   * made on an earlier account of the same name is never theirs (#1937).
   */
  private async recordsOf(username: string): Promise<ConsentRecord[]> {
    if (!this.provider) return [];
    let records = this.cache.get(username);
    if (!records) {
      records = await this.provider.list(username);
      this.cache.set(username, records);
    }
    const account = await this.accountOf(username);
    const created = account?.createdAt;
    return created ? records.filter((r) => !r.account || r.account === created) : records;
  }

  private async accountOf(username: string): Promise<{ username?: string; createdAt?: string; isActive?: boolean } | null> {
    return (await this.engine.getManager<AccountReader>('UserManager')?.getUser(username)) ?? null;
  }

  /**
   * The documents of `scope` that `username` has not accepted at their
   * current version — what they are to be asked. Empty when there is
   * nothing to ask (no documents, or no consent folder).
   */
  async pendingFor(username: string, scope: ConsentScope = CORE_CONSENT_SCOPE): Promise<ConsentDocument[]> {
    if (!this.provider || !username) return [];
    const docs = await this.documents(scope);
    if (docs.length === 0) return [];
    const records = await this.recordsOf(username);
    return docs.filter((d) => !records.some((r) => r.document === d.id && r.version === d.version));
  }

  /**
   * "Your consents" for the person `ctx` acts as: each document of core's and
   * of each registered add-on, with their acceptance of the current version
   * (or none) and their latest of any version.
   */
  async statusFor(ctx: ActorContext): Promise<ConsentScopeStatus[]> {
    const records = await this.recordsOf(ctx.username);
    const latestOf = (pred: (r: ConsentRecord) => boolean): ConsentRecord | null =>
      [...records].reverse().find(pred) ?? null;
    const out: ConsentScopeStatus[] = [];
    for (const scope of [CORE_CONSENT_SCOPE, ...this.addons.keys()]) {
      const docs = await this.documents(scope);
      if (docs.length === 0) continue;
      out.push({
        scope,
        statuses: docs.map((document) => ({
          document,
          current: latestOf((r) => r.document === document.id && r.version === document.version),
          latest: latestOf((r) => r.document === document.id)
        }))
      });
    }
    return out;
  }

  /**
   * Record that the person `ctx` acts as accepted what they were shown:
   * every document of `scope` they have not accepted at its current version.
   *
   * - Only the person, for themselves: a token, share or proxy is refused, and
   *   there is no way to name anyone else. The person must hold
   *   `profile-manage`, the permission for managing their own account.
   * - `seen` is what they were shown. A pending document missing from it, or
   *   shown at another version, refuses with `ConsentChangedError`, so nobody
   *   is recorded as accepting a version they never saw.
   * - Each acceptance is recorded as `consent-grant` (on-failure refuse)
   *   before it is stored: a failed audit record refuses the acceptance.
   *
   * @param how How they were asked: `sign-up`, `sign-in` or `add-on`
   * @returns The records written; empty when there was nothing to accept
   */
  async accept(ctx: ActorContext, scope: ConsentScope, seen: ConsentSeen[], how: string): Promise<ConsentRecord[]> {
    if (!this.provider) throw new ConsentRefusedError('Consent records cannot be kept on this site right now');
    if (ctx.viaToken || ctx.viaShare || ctx.viaProxy) {
      throw new ConsentRefusedError('Only the person themselves can accept, signed in: not a token, a share link or someone acting for them');
    }
    if (isJobContext(ctx) && ctx.origin !== 'request') {
      throw new ConsentRefusedError('An acceptance comes from the person, in a request; not from a job');
    }
    const subject = isJobContext(ctx) ? toPermissionSubject(ctx) : ctx;
    const pdp = this.engine.getManager<{ permits(s: unknown, a: string): Promise<boolean> }>('PolicyDecisionPoint');
    if (!subject.isAuthenticated || !pdp || !(await pdp.permits(subject, 'profile-manage'))) {
      throw new ConsentRefusedError(`${ctx.username} may not manage their own consents (needs profile-manage)`);
    }
    const account = await this.accountOf(ctx.username);
    if (!account || account.username !== ctx.username || account.isActive === false) {
      throw new ConsentRefusedError(`No active account '${ctx.username}' to record an acceptance on`);
    }

    const pending = await this.pendingFor(ctx.username, scope);
    for (const doc of pending) {
      if (!seen.some((s) => s.id === doc.id && s.version === doc.version)) {
        throw new ConsentChangedError(`${doc.title} changed (now version ${doc.version}) while you were reading; read it again`);
      }
    }

    const sink = this.engine.getManager<AuditEventSink>('AuditManager');
    const who = actorOf(ctx);
    const written: ConsentRecord[] = [];
    for (const doc of pending) {
      const record: ConsentRecord = {
        kind: 'accept',
        document: doc.id,
        scope,
        version: doc.version,
        effective: doc.effective,
        acceptedAt: new Date().toISOString(),
        ...(account.createdAt ? { account: account.createdAt } : {}),
        context: { by: ctx.username, how, origin: isJobContext(ctx) ? ctx.origin : 'request', ...(ctx.ipAddress ? { ipAddress: ctx.ipAddress } : {}) }
      };
      // Record first, then store: on-failure refuse throws here and nothing is stored.
      await recordAuditEvent(sink, {
        eventType: AUDIT_EVENT.CONSENT_GRANT,
        ...who,
        action: 'consent-grant',
        result: 'success',
        severity: 'low',
        resource: doc.id,
        resourceType: 'consent-document',
        metadata: { ...who.metadata, scope, version: doc.version, effective: doc.effective, how }
      });
      this.cache.delete(ctx.username);
      await this.provider.append(ctx.username, record);
      written.push(record);
    }
    if (written.length > 0) logger.info(`📜 [ConsentManager] ${ctx.username} accepted ${written.map((r) => `${r.document} v${r.version}`).join(', ')} (${how})`);
    return written;
  }

  /**
   * The account `username` was deleted (`AuthManager.closeAccess`): its
   * records go with it, after `consent-withdraw` names what it had accepted
   * (on-failure refuse: the records stay, and a later account of that name
   * still never inherits them). The audit log keeps the events for its
   * retention window.
   */
  async removeAccount(username: string, ctx: ActorContext): Promise<void> {
    if (!this.provider) return;
    const records = await this.provider.list(username);
    this.cache.delete(username);
    if (records.length === 0) return;
    const who = actorOf(ctx);
    await recordAuditEvent(this.engine.getManager<AuditEventSink>('AuditManager'), {
      eventType: AUDIT_EVENT.CONSENT_WITHDRAW,
      ...who,
      action: 'consent-withdraw',
      result: 'success',
      severity: 'low',
      resource: username,
      resourceType: 'account',
      reason: 'account-deleted',
      metadata: { ...who.metadata, account: username, accepted: records.map((r) => ({ document: r.document, version: r.version, acceptedAt: r.acceptedAt })) }
    });
    await this.provider.remove(username);
  }
}

export default ConsentManager;
