/**
 * FileManager — the one door for files (#1852, epic #1851).
 *
 * This first step only READS. It shows today's attachments as file records
 * (src/types/File.ts): the shared pool as the public place, and every vault
 * the requester may read. Nothing is written, moved or renamed; uploads,
 * per-place indexes and the rest are later steps
 * (docs/guides/storage-developer-guide.md).
 *
 * Access is the existing rules, asked at this door:
 * - the public place needs `asset-read`, from the PDP;
 * - a vault is read through AttachmentManager's own vault reads, so the
 *   container rule (owner or delegate, never a role, admin included) decides
 *   exactly as it does for a vault page's files.
 *
 * The operator inventory (the migration dry run, #1859) is not on the
 * engine's door: only an instance opened by {@link FileManager.openForOperator},
 * from the command line, answers it.
 */

import BaseManager from './BaseManager.js';
import ConfigurationManager from './ConfigurationManager.js';
import AttachmentManager from './AttachmentManager.js';
import IdentityManager from './IdentityManager.js';
import { systemContext } from '../context/bootActions.js';
import { IDENTITY_ID_PREFIX, ORPHAN_PREFIX } from '../utils/username.js';
import type PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import { isJobContext, type ActorContext } from '../context/ActorContext.js';
import { UNKNOWN_UPLOADER, type AssetRecord } from '../types/Asset.js';
import type { FileInventory, FilePlace, FileRecord } from '../types/File.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import { systemCategoryVaults } from '../utils/privateStorePath.js';
import { planClashRenames, planFileMigration, type FileMigrationReport } from '../utils/fileMigrationPlan.js';
import logger from '../utils/logger.js';

const SYSTEM_CATEGORY_KEY = 'ngdpbase.system-category';

/** The owner a public record names: its uploader, unless that is no user (`Unknown`, empty, an email used as a name). */
function recordedOwner(author: string | undefined): string | null {
  if (!author || author === UNKNOWN_UPLOADER || author.includes('@')) return null;
  return author;
}

function samePlace(a: FilePlace, b: FilePlace): boolean {
  if (a.kind === 'public' || b.kind === 'public') return a.kind === b.kind;
  return a.owner === b.owner && a.vault === b.vault;
}

class FileManager extends BaseManager {
  /** Set only by {@link openForOperator}: this instance answers the inventory. */
  private operatorInstance = false;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  /**
   * Open the door read-only for an operator command (#1859): the site's
   * configuration and attachment index, with nothing else started and
   * nothing written. The site may be running; this process changes no file.
   */
  static async openForOperator(): Promise<FileManager> {
    const managers = new Map<string, unknown>();
    const engine = { getManager: (name: string) => managers.get(name) ?? null } as unknown as WikiEngine;
    const config = new ConfigurationManager(engine);
    managers.set('ConfigurationManager', config);
    await config.initialize();
    // #2097: uploaders are stored as identity @ids; the dry run names owners by username.
    const identities = new IdentityManager(engine);
    managers.set('IdentityManager', identities);
    await identities.initialize({ readOnly: true });
    const attachments = new AttachmentManager(engine);
    managers.set('AttachmentManager', attachments);
    await attachments.initialize({ readOnly: true });
    const files = new FileManager(engine);
    files.operatorInstance = true;
    managers.set('FileManager', files);
    await files.initialize();
    return files;
  }

  // ── The viewer's door ────────────────────────────────────────────────────

  /** Every file `ctx` may read, newest first; `place` narrows it to one place. */
  async list(ctx: ActorContext, filter: { place?: FilePlace } = {}): Promise<FileRecord[]> {
    const all = await this.readable(ctx);
    return filter.place ? all.filter((f) => samePlace(f.place, filter.place as FilePlace)) : all;
  }

  /** The file with this id, when `ctx` may read it. */
  async get(id: string, ctx: ActorContext): Promise<FileRecord | null> {
    return (await this.readable(ctx)).find((f) => f.id === id) ?? null;
  }

  /**
   * The files named `filename` that `ctx` may read: one per place at most,
   * since a name is unique within a place (today's pool can hold more than
   * one, which is what the migration's suffixes are for). `place` narrows it.
   */
  async findByName(filename: string, ctx: ActorContext, place?: FilePlace): Promise<FileRecord[]> {
    return (await this.list(ctx, place ? { place } : {})).filter((f) => f.filename === filename);
  }

  /**
   * The username a public record's uploader names (#2097): the uploader is
   * stored as an identity @id, resolved through IdentityManager; an orphan,
   * an @id with no account, `Unknown` or an email names no owner.
   */
  private async ownerOf(author: string | undefined): Promise<string | null> {
    const recorded = recordedOwner(author);
    if (!recorded || (!recorded.startsWith(IDENTITY_ID_PREFIX) && !recorded.startsWith(ORPHAN_PREFIX))) return recorded;
    const identities = this.engine.getManager<IdentityManager>('IdentityManager');
    if (!identities) return null;
    return identities.usernameOf(systemContext(this.engine, 'a file record owner: the uploader username (#2097)'), recorded);
  }

  private async readable(ctx: ActorContext): Promise<FileRecord[]> {
    const attachments = this.engine.getManager<AttachmentManager>('AttachmentManager');
    if (!attachments || !ctx) return [];
    const out: FileRecord[] = [];
    if (await this.mayReadPublic(ctx)) {
      const category = this.defaultCategory();
      for (const asset of await attachments.sharedPoolAssetRecords()) {
        out.push(FileManager.toFileRecord(asset, { kind: 'public' }, await this.ownerOf(asset.author), category));
      }
    }
    for (const v of await attachments.readableVaultAssetRecords(ctx)) {
      const category = this.vaultCategory(v.vault);
      for (const asset of v.files) {
        out.push(FileManager.toFileRecord(asset, { kind: 'vault', owner: v.owner, vault: v.vault }, v.owner, category));
      }
    }
    return out.sort((a, b) => (b.dateCreated ?? '').localeCompare(a.dateCreated ?? ''));
  }

  /** `asset-read` for the public place, from the PDP. No PDP, no answer: closed. */
  private async mayReadPublic(ctx: ActorContext): Promise<boolean> {
    const pdp = this.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint');
    if (!pdp) return false;
    return pdp.permits(ctx, 'asset-read');
  }

  // ── The operator's inventory (#1859) ─────────────────────────────────────

  /**
   * Everything kept as files, for the migration dry run: the public files in
   * full and each vault as counts (files, bytes, clash renames), never its
   * names. Only on an instance opened by {@link openForOperator}, for an
   * operator's context.
   */
  async inventory(ctx: ActorContext): Promise<FileInventory> {
    if (!this.operatorInstance || !ctx || !isJobContext(ctx) || ctx.origin !== 'operator') {
      throw new Error('FileManager.inventory is for the operator command only (npm run files:migration:dry)');
    }
    const attachments = this.engine.getManager<AttachmentManager>('AttachmentManager');
    if (!attachments) return { publicFiles: [], vaults: [] };
    const category = this.defaultCategory();
    const publicFiles: FileRecord[] = [];
    for (const asset of await attachments.sharedPoolAssetRecords()) {
      publicFiles.push(FileManager.toFileRecord(asset, { kind: 'public' }, await this.ownerOf(asset.author), category));
    }
    const digits = this.suffixDigits();
    const vaults = (await attachments.vaultFileInventory()).map((v) => ({
      owner: v.owner,
      vault: v.vault,
      systemCategory: this.vaultCategory(v.vault),
      readable: v.readable,
      files: v.entries ? v.entries.length : v.filesOnDisk,
      bytes: v.entries ? v.entries.reduce((sum, e) => sum + e.contentSize, 0) : v.bytesOnDisk,
      clashes: v.entries
        ? planClashRenames(v.entries.map((e) => ({ id: e.id, filename: e.name, dateCreated: e.dateCreated })), digits).size
        : null
    }));
    logger.info(`[FileManager] Inventory for ${ctx.username}: ${publicFiles.length} public file(s), ${vaults.length} vault(s) with files`);
    return { publicFiles, vaults };
  }

  /** The dry run: the inventory, planned with the configured values. Writes nothing. */
  async migrationDryRun(ctx: ActorContext): Promise<FileMigrationReport> {
    const inventory = await this.inventory(ctx);
    const config = this.configManager();
    const ownerMap = config?.getProperty('ngdpbase.files.migration.owner-map', {});
    const defaultOwner = config?.getProperty('ngdpbase.files.migration.default-owner', 'admin');
    return planFileMigration(inventory, {
      ownerMap: ownerMap && typeof ownerMap === 'object' ? ownerMap as Record<string, string> : {},
      defaultOwner: typeof defaultOwner === 'string' && defaultOwner ? defaultOwner : 'admin',
      suffixDigits: this.suffixDigits()
    });
  }

  // ── The record ───────────────────────────────────────────────────────────

  /** An asset record as a file record: the same fields, plus place, owner and system-category. */
  static toFileRecord(asset: AssetRecord, place: FilePlace, owner: string | null, systemCategory: string | null): FileRecord {
    return {
      id: asset.id,
      filename: asset.filename,
      ...(asset.name ? { name: asset.name } : {}),
      ...(asset.description ? { description: asset.description } : {}),
      keywords: asset.keywords,
      encodingFormat: asset.encodingFormat,
      ...(asset.contentSize !== undefined ? { contentSize: asset.contentSize } : {}),
      url: asset.url,
      mentions: asset.mentions,
      ...(asset.dateCreated ? { dateCreated: asset.dateCreated } : {}),
      ...(asset.author ? { author: asset.author } : {}),
      ...(asset.dateModified ? { dateModified: asset.dateModified } : {}),
      ...(asset.editor ? { editor: asset.editor } : {}),
      place,
      owner,
      systemCategory
    };
  }

  private configManager(): ConfigurationManager | undefined {
    return this.engine.getManager<ConfigurationManager>('ConfigurationManager');
  }

  /** The public place's category today: the default entry of `ngdpbase.system-category`. */
  private defaultCategory(): string | null {
    const categories = this.configManager()?.getProperty(SYSTEM_CATEGORY_KEY, null);
    if (!categories || typeof categories !== 'object') return null;
    const entry = Object.entries(categories as Record<string, { default?: unknown } | null>).find(([, e]) => e?.default === true);
    return entry ? entry[0] : null;
  }

  /** The category that declares this vault, or null when none does. */
  private vaultCategory(vault: string): string | null {
    return systemCategoryVaults(this.configManager()?.getProperty(SYSTEM_CATEGORY_KEY, null)).find((v) => v.vaultId === vault)?.key ?? null;
  }

  private suffixDigits(): number {
    const n = Number(this.configManager()?.getProperty('ngdpbase.files.migration.clash-suffix-digits', 3));
    return Number.isInteger(n) && n > 0 ? n : 3;
  }
}

export default FileManager;
