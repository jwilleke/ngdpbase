import path from 'path';
import { promises as fs } from 'fs';
import BaseManager, { type BackupFolder, type ManagerStats } from './BaseManager.js';
import logger from '../utils/logger.js';
import { filenameFromOrg } from '../utils/orgFilename.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import { randomUUID } from 'crypto';
import type { Organization, OrganizationInput, OrganizationUpdate, PostalAddress, ContactPoint } from '../types/Organization.js';
import type { OrganizationProvider } from '../types/OrganizationProvider.js';
import type { Person } from '../types/Person.js';
import type { ActorContext } from '../context/ActorContext.js';
import { installCompletePath } from '../utils/configFiles.js';
import { recordContactChange, requireContactPermission, requireRecordAccess } from '../utils/contactAccess.js';

interface OrganizationProviderConstructor {
  new (engine: WikiEngine): OrganizationProvider;
}

interface MetricsManagerLike {
  recordCacheLookup(attributes: { manager: string; cache: string; result: 'hit' | 'miss' }): void;
}

/**
 * Subset of install-form data this manager needs to seed the anchor org.
 * Kept narrow so InstallService and tests can pass plain objects without
 * importing the full InstallData type.
 */
export interface OrganizationSeedData {
  orgName: string;
  orgLegalName?: string;
  orgDescription?: string;
  orgFoundingDate?: string;
  orgUrl?: string;
  orgAddressLocality?: string;
  orgAddressRegion?: string;
  orgAddressCountry?: string;
  /** Email used for the install's primary technical contact. */
  adminEmail?: string;
  /** Filename to write under storagedir, e.g. "acme-corporation.json". */
  filename?: string;
}

/**
 * OrganizationManager — canonical core record for organizations (#617).
 *
 * Owns the on-disk Organization records end-to-end. The install's anchor
 * org is identified by `ngdpbase.application.organization.file`; the rest
 * of the org files in `storagedir` are additional orgs in a multi-org
 * install. UserManager resolves `Person.memberOf` via `getInstallOrg()`,
 * so the anchor org is the implicit parent for every user-paired Person.
 */
class OrganizationManager extends BaseManager {
  readonly description = 'Canonical Organization records (#617)';

  private provider: OrganizationProvider | null = null;
  private providerClass?: string;
  /** `ngdpbase.application.organization.storagedir`, resolved at start: what a backup copies (#1876). */
  private storageDir: string | null = null;

  // #620: cache the install-anchor lookup and by-id/by-file lookups. Read
  // hot path: UserManager.syncPersonOnCreate / applyRoleDiff hit
  // getInstallOrg() per write event; the admin org-CRUD UI hits getByFile.
  // Cleared on any write.
  private installOrgCache: { value: Organization | null; valid: boolean } = { value: null, valid: false };
  private byIdCache = new Map<string, Organization | null>();
  private byFileCache = new Map<string, Organization | null>();

  // Lazily-resolved MetricsManager reference (#620 hit/miss telemetry).
  private metricsRef: MetricsManagerLike | null | undefined = undefined;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('OrganizationManager requires ConfigurationManager');
    }

    const storageDir = this.configuredStorageDir(configManager)!;
    this.storageDir = storageDir;
    const preflight = this.preflightConfiguredPath(
      'ngdpbase.application.organization.storagedir',
      storageDir
    );
    if (!preflight.ok) {
      logger.warn('🏢 OrganizationManager initialized in degraded mode (storage path unavailable)');
      return;
    }

    const defaultProvider = configManager.getProperty(
      'ngdpbase.application.organization.provider.default',
      'fileorganizationprovider'
    ) as string;
    const providerName = configManager.getProperty(
      'ngdpbase.application.organization.provider',
      defaultProvider
    ) as string;
    this.providerClass = this.normalizeProviderName(providerName);

    logger.info(`🏢 Loading organization provider: ${providerName} (${this.providerClass})`);
    const mod = await import(/* @vite-ignore */ `../providers/${this.providerClass}.js`) as { default: OrganizationProviderConstructor };
    this.provider = new mod.default(this.engine);
    await this.provider.initialize();

    // Startup invariant: if install is complete and an anchor file is named,
    // the file MUST exist. Fail fast — operator deleted or never provisioned it.
    const installComplete = await fileExists(installCompletePath(configManager.getInstanceDataFolder()));
    const anchorFile = configManager.getProperty(
      'ngdpbase.application.organization.file',
      ''
    ) as string;
    if (installComplete && anchorFile) {
      const anchorPath = path.join(storageDir, anchorFile);
      const exists = await fileExists(anchorPath);
      if (!exists) {
        throw new Error(
          `[OrganizationManager] Install is complete but the anchor organization file is missing: ${anchorPath}. ` +
          'Restore it from backup, or unset \'ngdpbase.application.organization.file\' if the anchor was intentionally removed.'
        );
      }
    } else if (installComplete && !anchorFile) {
      // #1027: the invariant above only fires when a file is NAMED but absent.
      // An empty key had nothing to validate, so the case that actually breaks
      // instances passed startup in silence — every role assignment then fails
      // in UserManager.syncRoleAdd, including `admin` on the default admin.
      //
      // Warn rather than throw: instances are running in this state right now,
      // and turning a silent misconfiguration into a boot failure would take
      // them down rather than tell them what is wrong.
      logger.warn(
        '🏢 No anchor Organization named on a completed install ' +
        '(ngdpbase.application.organization.file is empty). One will be resolved on first use — ' +
        'the sole existing record is adopted, or a minimal one is seeded from the base URL. ' +
        'Role assignment only stays inoperative if SEVERAL records exist, since then nothing ' +
        'can say which one anchors the install; set that config key to resolve it. (#1027)'
      );
    }

    logger.info(`🏢 OrganizationManager initialized (${(await this.provider.list()).length} orgs)`);
  }

  /** Provider accessor, mainly for tests. */
  /** `ngdpbase.application.organization.storagedir`, resolved: where the records are. */
  private configuredStorageDir(configManager: ConfigurationManager | null | undefined = this.engine.getManager<ConfigurationManager>('ConfigurationManager')): string | null {
    return configManager?.getResolvedDataPath('ngdpbase.application.organization.storagedir', './data/organizations') ?? null;
  }

  /**
   * Organization records are in the backup (#1876), as `<stem>.organizations.tar` beside the document. BackupManager backs it up, stages it in a site restore and puts it
   * in place at the next start, before the records are read (#1985).
   */
  override backupFolders(): BackupFolder[] {
    return [{ part: 'organizations', folder: this.storageDir ?? this.configuredStorageDir() }];
  }

  getProvider(): OrganizationProvider | null {
    return this.provider;
  }

  /**
   * Create the anchor organization from the instance's own identity (#1027).
   *
   * Written to the organizations storage directory like any other record, so it
   * is editable through the admin UI afterwards. That is the point: an org
   * supplied by the deployment (a mounted ConfigMap file, say) is read-only and
   * cannot be corrected without a redeploy. Application configuration should
   * not require editing deployment manifests.
   *
   * Filename follows the convention the install wizard uses — the base-url host
   * with dots as hyphens — so an instance seeded here and one installed through
   * the wizard are indistinguishable afterwards.
   */
  private async seedAnchorOrganization(
    configManager: ConfigurationManager | null | undefined
  ): Promise<Organization | null> {
    const baseUrl = (configManager?.getBaseURL?.() ?? '').trim();
    if (!baseUrl) {
      logger.warn(
        '🏢 Cannot seed an anchor organization: ngdpbase.application.base-url is not set. ' +
        'Role assignment is inoperative until an organization exists. (#1027)'
      );
      return null;
    }

    const url = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const name = (configManager?.getProperty('ngdpbase.application-name', '') as string) || url;

    try {
      // Delegates to the same path the install wizard uses, so a seeded
      // instance and a wizard-installed one are indistinguishable afterwards:
      // same filename convention (filenameFromOrg), same record shape, same
      // idempotency. Passing no address or contact details leaves those fields
      // off entirely — buildAddress/buildContactPoints return undefined for
      // empty input — which is deliberate. Inventing them would put fabricated
      // data on what may be a public instance; they are the operator's to add
      // through /admin/organizations.
      const created = await this.seedFromConfig({ orgName: name, orgUrl: url });
      if (created) {
        logger.info(
          `🏢 Seeded the install's anchor organization: ${created.name} (${created['@id']}). ` +
          'Edit it under /admin/organizations. (#1027)'
        );
      }
      return created;
    } catch (error) {
      logger.warn(
        '🏢 Failed to seed the anchor organization: ' +
        (error instanceof Error ? error.message : String(error)) +
        ' — role assignment is inoperative. (#1027)'
      );
      return null;
    }
  }

  /**
   * Return the install's anchor org, resolving or seeding one if needed (#1027).
   *
   * Three tiers, in order:
   *
   *   1. `ngdpbase.application.organization.file` names it — what the install
   *      wizard writes.
   *   2. No key, but exactly one org record exists — adopt it. An install with
   *      a single organization has no ambiguity about which one anchors it, and
   *      requiring a config key to state the obvious is what left headless
   *      deployments silently unable to assign any role.
   *   3. Nothing at all — seed a minimal record from the instance's own
   *      identity. An instance always belongs to *something*; having no anchor
   *      is never the correct end state, it just breaks role assignment.
   *
   * Deliberately never writes the config key back. Instance config is a
   * read-only mount on containerised deployments, so a resolution strategy that
   * depends on persisting a key would work locally and fail exactly where this
   * problem actually bites.
   */
  async getInstallOrg(): Promise<Organization | null> {
    if (this.installOrgCache.valid) {
      this.getMetrics()?.recordCacheLookup({ manager: 'OrganizationManager', cache: 'installOrg', result: 'hit' });
      return this.installOrgCache.value;
    }
    this.getMetrics()?.recordCacheLookup({ manager: 'OrganizationManager', cache: 'installOrg', result: 'miss' });
    const provider = this.requireProvider();
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const filename = configManager?.getProperty('ngdpbase.application.organization.file', '') as string;
    let value = filename ? await provider.getByFile(filename) : null;

    if (!value && !filename) {
      const existing = await provider.list();

      if (existing.length === 1) {
        // Tier 2: one record, no ambiguity about which anchors the install.
        value = existing[0];
        logger.info(
          `🏢 Adopted the only organization record as the install anchor: ${value['@id']}. ` +
          'Set ngdpbase.application.organization.file to make this explicit. (#1027)'
        );
      } else if (existing.length === 0) {
        // Tier 3: nothing to adopt, so create one from the instance's identity.
        value = await this.seedAnchorOrganization(configManager);
      } else {
        // Several records and nothing naming the anchor. Deliberately resolves
        // to null: picking one arbitrarily could bind every role to the wrong
        // organization, and seeding an additional record would add to the very
        // ambiguity being reported. The operator has to say which one.
        logger.warn(
          `🏢 ${existing.length} organization records exist but none is named as the install anchor. ` +
          'Set ngdpbase.application.organization.file — role assignment is inoperative until you do. (#1027)'
        );
      }
    }

    // #1027: without an anchor org, UserManager.syncRoleAdd cannot attach a
    // Person to a Role, so NO role — including `admin` on the default admin
    // account — is ever assigned. That used to happen in complete silence: the
    // null is cached as valid, so this resolves once and stays null for the
    // process lifetime with nothing logged. Warn here, where the cause is
    // known; the caller only sees an absent role.
    if (!value && filename) {
      logger.warn(
        `🏢 Anchor Organization file "${filename}" did not resolve — role assignment is inoperative. ` +
        'Check the file exists in the organizations storage directory. (#1027)'
      );
    } else if (!value) {
      // Reaching here with no key means tier 2 found several records (already
      // warned, with the count) or tier 3's seed failed (already warned, with
      // the reason). A second generic warning would only repeat the first in
      // vaguer terms — and the one that used to print here still told operators
      // that "headless installs must pre-supply the Organization JSON-LD file",
      // which stopped being true when seeding landed. It contradicted the
      // ambiguity warning printed immediately above it.
      logger.warn(
        '🏢 Could not resolve an anchor Organization — role assignment is inoperative: ' +
        'no user can be granted any role, including admin. See the warning above for which ' +
        'case applies. (#1027)'
      );
    }

    this.installOrgCache = { value, valid: true };
    return value;
  }

  /** One organization by `@id`, for a caller who may read contacts (`identity-read`), or core's own work (#2018). */
  async getById(ctx: ActorContext, id: string): Promise<Organization | null> {
    await requireRecordAccess(this.engine, ctx, 'read');
    if (this.byIdCache.has(id)) {
      this.getMetrics()?.recordCacheLookup({ manager: 'OrganizationManager', cache: 'byId', result: 'hit' });
      return this.byIdCache.get(id) ?? null;
    }
    this.getMetrics()?.recordCacheLookup({ manager: 'OrganizationManager', cache: 'byId', result: 'miss' });
    const org = await this.requireProvider().getById(id);
    this.byIdCache.set(id, org);
    return org;
  }

  /** One organization by its file name, decided as {@link getById} (#2018). */
  async getByFile(ctx: ActorContext, filename: string): Promise<Organization | null> {
    await requireRecordAccess(this.engine, ctx, 'read');
    if (this.byFileCache.has(filename)) {
      this.getMetrics()?.recordCacheLookup({ manager: 'OrganizationManager', cache: 'byFile', result: 'hit' });
      return this.byFileCache.get(filename) ?? null;
    }
    this.getMetrics()?.recordCacheLookup({ manager: 'OrganizationManager', cache: 'byFile', result: 'miss' });
    const org = await this.requireProvider().getByFile(filename);
    this.byFileCache.set(filename, org);
    return org;
  }

  /** #1006: how many organizations this instance holds. Count only. */
  async getManagerStats(): Promise<ManagerStats> {
    const n = (await this.requireProvider().list()).length;
    return { ...(await super.getManagerStats()), count: n, summary: `${n} organization(s)` };
  }

  // ── The door (#1930) ─────────────────────────────────────────────────────
  //
  // Each call takes the caller's context first and asks the PDP: `identity-read` to read,
  // `identity-manage` to change; each change is recorded as the `identity-manage` audit
  // event; a refusal throws ContactRefusedError. getById and getByFile take the
  // caller's context too (#2018); core's own reads pass the system context.
  // getInstallOrg is the site's own anchor Organization, named in configuration.

  /** Every organization, for a caller who may read contacts (`identity-read`). */
  async list(ctx: ActorContext): Promise<Organization[]> {
    await requireContactPermission(this.engine, ctx, 'read');
    return this.requireProvider().list();
  }

  /** One organization by `@id`: {@link getById}. */
  async get(ctx: ActorContext, id: string): Promise<Organization | null> {
    return this.getById(ctx, id);
  }

  /**
   * Organizations whose `name`, `legalName`, `email` or a contact point's
   * email contains `query`, ignoring case; an empty query matches all. At
   * most `limit` (`ngdpbase.application.organization.search.limit` by default).
   */
  async search(ctx: ActorContext, query: string, options: { limit?: number } = {}): Promise<Organization[]> {
    await requireContactPermission(this.engine, ctx, 'read');
    const configured = Number(this.engine.getManager<ConfigurationManager>('ConfigurationManager')
      ?.getProperty('ngdpbase.application.organization.search.limit', 50));
    const limit = options.limit ?? (Number.isFinite(configured) && configured > 0 ? configured : 50);
    const q = (query ?? '').trim().toLowerCase();
    const out: Organization[] = [];
    for (const org of await this.requireProvider().list()) {
      const texts = [org.name, org.legalName, org.email, ...(org.contactPoint ?? []).map((c) => c.email)];
      if (q && !texts.some((v) => typeof v === 'string' && v.toLowerCase().includes(q))) continue;
      out.push(org);
      if (limit > 0 && out.length >= limit) break;
    }
    return out;
  }

  /**
   * The people affiliated with an organization, read from each person's
   * `affiliation` (#1930): the link is stored once, on the person. Each comes
   * with the role they hold there, when one is given.
   */
  async people(ctx: ActorContext, organizationId: string): Promise<Array<{ person: Person; role?: string }>> {
    await requireContactPermission(this.engine, ctx, 'read');
    const persons = this.engine.getManager<{ list(ctx: ActorContext): Promise<Person[]> }>('IdentityManager');
    if (!persons) return [];
    const out: Array<{ person: Person; role?: string }> = [];
    for (const person of await persons.list(ctx)) {
      for (const a of person.affiliation ?? []) {
        if (a.organization === organizationId) out.push({ person, ...(a.role ? { role: a.role } : {}) });
      }
    }
    return out;
  }

  /**
   * Create an organization. `name` is required; `@id` defaults to the `url`,
   * else a new `urn:uuid:`. `filename` is for the install anchor (seeding);
   * other records take one from the url or name.
   */
  async create(ctx: ActorContext, org: OrganizationInput, filename?: string): Promise<Organization> {
    await requireContactPermission(this.engine, ctx, 'manage');
    if (!org || typeof org.name !== 'string' || !org.name.trim()) throw new Error('OrganizationManager.create: an organization needs a name');
    const record: Organization = {
      ...org,
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': (typeof org['@id'] === 'string' && org['@id']) || (typeof org.url === 'string' && org.url) || `urn:uuid:${randomUUID()}`,
      name: org.name
    };
    const result = await this.requireProvider().create(record, filename);
    this.invalidateCache();
    await recordContactChange(this.engine, ctx, {
      kind: 'organization', operation: 'create', id: record['@id'],
      fields: Object.keys(org).filter((k) => !k.startsWith('@')).sort()
    });
    return result;
  }

  async update(ctx: ActorContext, id: string, patch: OrganizationUpdate): Promise<Organization | null> {
    await requireContactPermission(this.engine, ctx, 'manage');
    const result = await this.requireProvider().update(id, patch);
    this.invalidateCache();
    if (result) {
      await recordContactChange(this.engine, ctx, {
        kind: 'organization', operation: 'update', id,
        fields: Object.keys(patch ?? {}).filter((k) => !k.startsWith('@')).sort()
      });
    }
    return result;
  }

  async delete(ctx: ActorContext, id: string): Promise<boolean> {
    await requireContactPermission(this.engine, ctx, 'manage');
    const result = await this.requireProvider().delete(id);
    this.invalidateCache();
    if (result) await recordContactChange(this.engine, ctx, { kind: 'organization', operation: 'delete', id });
    return result;
  }

  /**
   * Clear all caches. Called on every write — the simplest correct
   * invalidation. Per-key invalidation can come later if needed.
   * Public so callers (e.g., admin "rebuild" tools) can force a cache miss.
   */
  invalidateCache(): void {
    this.installOrgCache = { value: null, valid: false };
    this.byIdCache.clear();
    this.byFileCache.clear();
  }

  /**
   * Seed the install's anchor org from install-form data. Idempotent: if an
   * org file with the configured filename already exists, this is a no-op
   * (returns the existing record). The org JSON-LD file at
   * `<storagedir>/<file>` is the single source of truth for `name`, `url`,
   * `address`, etc. — those fields live IN THE FILE, not in config. Config
   * holds only the pointer (`ngdpbase.application.organization.file`).
   */
  async seedFromConfig(data: OrganizationSeedData): Promise<Organization | null> {
    const provider = this.requireProvider();
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('OrganizationManager.seedFromConfig requires ConfigurationManager');
    }

    const filename = data.filename
      || (configManager.getProperty('ngdpbase.application.organization.file', '') as string)
      || filenameFromOrg({ url: data.orgUrl, name: data.orgName });

    const existing = await provider.getByFile(filename);
    if (existing) {
      logger.debug(`🏢 Anchor org file ${filename} already present; skipping seed`);
      return existing;
    }

    const id = data.orgUrl
      || (configManager.getProperty('ngdpbase.application.base-url', '') as string)
      || `urn:ngdpbase:org:${slugify(data.orgName)}`;

    const org: Organization = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': id,
      name: data.orgName,
      url: data.orgUrl || id,
      ...(data.orgLegalName ? { legalName: data.orgLegalName } : {}),
      ...(data.orgDescription ? { description: data.orgDescription } : {}),
      ...(data.orgFoundingDate ? { foundingDate: data.orgFoundingDate } : {}),
      address: buildAddress(data),
      contactPoint: buildContactPoints(data)
    };

    return provider.create(org, filename);
  }

  private requireProvider(): OrganizationProvider {
    if (!this.provider) {
      throw new Error('OrganizationManager: no provider available (initialization failed or storage path unavailable)');
    }
    return this.provider;
  }

  private getMetrics(): MetricsManagerLike | null {
    if (this.metricsRef === undefined) {
      this.metricsRef = this.engine.getManager<MetricsManagerLike>('MetricsManager') ?? null;
    }
    return this.metricsRef;
  }

  private normalizeProviderName(providerName: string): string {
    if (!providerName) {
      throw new Error('Organization provider name cannot be empty');
    }
    const lower = providerName.toLowerCase();
    const known: Record<string, string> = {
      fileorganizationprovider: 'FileOrganizationProvider',
      jsonorganizationprovider: 'FileOrganizationProvider'
    };
    if (known[lower]) return known[lower];
    return lower
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }
}

function buildAddress(seed: OrganizationSeedData): PostalAddress | undefined {
  if (!seed.orgAddressLocality && !seed.orgAddressRegion && !seed.orgAddressCountry) {
    return undefined;
  }
  return {
    '@type': 'PostalAddress',
    addressLocality: seed.orgAddressLocality || null,
    addressRegion: seed.orgAddressRegion || null,
    addressCountry: seed.orgAddressCountry || null
  };
}

function buildContactPoints(seed: OrganizationSeedData): ContactPoint[] | undefined {
  if (!seed.adminEmail) return undefined;
  return [
    {
      '@type': 'ContactPoint',
      contactType: 'Technical Support',
      email: seed.adminEmail
    }
  ];
}

function slugify(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'organization';
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export default OrganizationManager;
