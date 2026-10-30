/**
 * FileManager — the one door for files (#1852, epic #1851).
 *
 * It reads today's attachments as file records (src/types/File.ts): the
 * shared pool as the public place, and every vault the requester may read.
 * It writes through one door, `put` (#2148): a file goes into the place the
 * caller chose, after the permission for that place, with AttachmentManager
 * as the storage underneath; `placesWritableBy` lists the places a user may
 * write to. Rename, move, delete and per-place indexes are later steps
 * (docs/guides/storage-developer-guide.md).
 *
 * Read access is the existing rules, asked at this door:
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
import AttachmentManager, { AUDIT_WRITE_FAILED, type AttachmentMetadata, type PutFile, type PutOptions, type UploadOptions } from './AttachmentManager.js';
import IdentityManager from './IdentityManager.js';
import type ImportManager from './ImportManager.js';
import type PageManager from './PageManager.js';
import type SharedFolderManager from './SharedFolderManager.js';
import { systemContext } from '../context/bootActions.js';
import { IDENTITY_ID_PREFIX, ORPHAN_PREFIX } from '../utils/username.js';
import type PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import { actorOf, isJobContext, type ActorContext } from '../context/ActorContext.js';
import { buildAttachmentAuditEvent, recordAuditEvent, type AttachmentDetail, type AuditEventSink } from '../utils/auditEvents.js';
import { UNKNOWN_UPLOADER, type AssetRecord } from '../types/Asset.js';
import type { FileInventory, FilePlace, FileRecord } from '../types/File.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import { isSharedFolderOwner, isValidStoreId, parsePrivatePageName, privateStoreLayoutFromConfig, systemCategoryVaults, type PrivateStoreLayout } from '../utils/privateStorePath.js';
import { privateStoreIdsOf } from '../utils/privateStoreFiles.js';
import { planClashRenames, planFileMigration, type FileMigrationReport } from '../utils/fileMigrationPlan.js';
import logger from '../utils/logger.js';

const SYSTEM_CATEGORY_KEY = 'ngdpbase.system-category';

/** The owner a public record names: its uploader, unless that is no user (`Unknown`, empty, an email used as a name). */
function recordedOwner(author: string | undefined): string | null {
  if (!author || author === UNKNOWN_UPLOADER || author.includes('@')) return null;
  return author;
}

/**
 * What `put` hands back (#2149): the stored file's metadata, and, when
 * vetting cleaned it, what was removed (one note per kind), so the uploader
 * can be told.
 */
export type PutResult = AttachmentMetadata & { cleaned?: string[] };

/** A place the Upload file dialog offers (#2149): its key in the form, the words the user reads, and the place. */
export interface UploadPlace {
  key: string;
  label: string;
  place: FilePlace;
}

/** Where the Upload file dialog was opened (#2149): the page's path, and the page it shows, when there is one. */
export interface UploadWhere {
  path?: string;
  pageName?: string;
}

function samePlace(a: FilePlace, b: FilePlace): boolean {
  if (a.kind === 'vault' && b.kind === 'vault') return a.owner === b.owner && a.vault === b.vault;
  if (a.kind === 'shared-folder' && b.kind === 'shared-folder') return a.folder === b.folder;
  return a.kind === 'public' && b.kind === 'public';
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

  // ── The write door (#2148) ───────────────────────────────────────────────

  /**
   * The places `ctx` may put a file in (#2148, operator 2026-10-30): the
   * public place when the PDP grants `asset-upload`; each of the user's own
   * vaults the vault rule lets them upload to (the default vault, and every
   * vault they already have); each shared folder where they hold
   * `shared-folder-file`. A place they may not write to is never listed.
   *
   * Each place is asked exactly as {@link put} asks it, so what is offered is
   * what the door allows. An affordance: nothing is recorded.
   */
  async placesWritableBy(ctx: ActorContext): Promise<FilePlace[]> {
    if (!ctx) return [];
    const candidates: FilePlace[] = [{ kind: 'public' }];
    for (const vault of await this.ownVaultIds(ctx)) candidates.push({ kind: 'vault', owner: ctx.username, vault });
    for (const folder of this.engine.getManager<SharedFolderManager>('SharedFolderManager')?.folderNames() ?? []) {
      candidates.push({ kind: 'shared-folder', folder });
    }
    const out: FilePlace[] = [];
    for (const place of candidates) {
      if (await this.mayPut(ctx, place)) out.push(place);
    }
    return out;
  }

  /**
   * Put a file in `place` (#2148): the one write door. The permission for
   * that place is asked first, and a refusal stores nothing. Then ICE vets
   * the file (#2149): its type from its bytes, and its format's shim cleans
   * it; the cleaned copy is the one kept. AttachmentManager stores it as the
   * place requires (sealed in a sealed vault or shared folder), and this door
   * records the upload with what vetting removed (a sealed place's file by
   * id only, #2048). No page decides the place: `options.pageName` is only
   * the page that shows it.
   *
   * @throws Error 'Permission denied: …' when `ctx` may not write there, or
   *   is nobody (#1926); a route answers it 401 or 403.
   * @throws IceVetRefused when the file could not be checked; nothing is stored
   */
  async put(ctx: ActorContext, place: FilePlace, file: PutFile, options: PutOptions = {}): Promise<PutResult> {
    const attachments = this.engine.getManager<AttachmentManager>('AttachmentManager');
    if (!attachments) throw new Error('FileManager requires AttachmentManager');
    if (!ctx) throw new Error('Permission denied: no context supplied');
    if (!FileManager.isPlace(place)) throw new Error('Not a place a file can be put in');
    if (!(await this.mayPut(ctx, place))) {
      logger.warn(`📎 Permission denied: ${ctx.username} may not put a file in ${FileManager.describePlace(place)}`);
      throw new Error('Permission denied: You do not have permission to upload attachments');
    }
    const imports = this.engine.getManager<ImportManager>('ImportManager');
    if (!imports) throw new Error('FileManager requires ImportManager: every file is vetted before it is kept (#2149)');
    const vetted = await imports.vetFile({
      name: file.info.originalName,
      bytes: file.bytes,
      ...(file.info.mimeType ? { mediaType: file.info.mimeType } : {})
    }, ctx);
    const stored = await attachments.storeInPlace(ctx, place, {
      bytes: vetted.bytes,
      // A cleaned file is the size of what is kept; otherwise the size given, as before.
      info: { ...file.info, mimeType: vetted.mediaType, ...(vetted.removed.length > 0 ? { size: vetted.bytes.length } : {}) }
    }, options);
    const cleaned = vetted.removed.map(r => r.detail);
    // #1183, #2149: recorded here, at the owner's door, so every write path is covered.
    await this.recordFileEvent('upload', ctx, cleaned.length > 0 ? { ...stored.record, cleaned } : stored.record, options.wikiContext);
    return cleaned.length > 0 ? { ...stored.metadata, cleaned } : stored.metadata;
  }

  /**
   * Record a file stored or deleted (#2149: moved here from AttachmentManager,
   * which stores and records nothing itself). An upload is `continue`: a
   * failed record is logged, never fatal. A delete is critical: it rethrows,
   * tagged `AUDIT_WRITE_FAILED`, so the delete does not happen unrecorded and
   * a caller can tell an unwritable record from a failed delete.
   *
   * A sealed store's file is recorded by id and store only (#2048), its
   * owner by identity @id with the username beside it (#2041).
   * AttachmentManager's delete door calls this until deleting is FileManager's.
   */
  async recordFileEvent(
    op: 'upload' | 'delete',
    context: ActorContext,
    detail: AttachmentDetail,
    wikiContext?: { request?: { ip?: string } | null }
  ): Promise<void> {
    // Lazily resolved: absent during early boot, which recordAuditEvent treats as a configuration state, not a failure.
    const sink = this.engine?.getManager?.('AuditManager') as AuditEventSink | null;
    if (!sink) return;

    // #1179: read from the context — who, and the address it came from. The
    // WikiContext's request IP remains as the fallback for a caller whose
    // subject predates the address riding on it.
    const who = actorOf(context);
    // #2041: a sealed store's owner is named by identity @id in the record; a
    // name with no account as given.
    const named: AttachmentDetail = 'sealedStore' in detail
      ? {
        ...detail,
        sealedStore: {
          ...detail.sealedStore,
          owner: (await this.engine.getManager<IdentityManager>('IdentityManager')
            ?.identityIdOf(systemContext(this.engine, 'record a sealed-store file change: the owner identity @id (#2041)'), detail.sealedStore.owner)) ?? detail.sealedStore.owner,
          ownerUser: detail.sealedStore.owner
        }
      }
      : detail;
    const event = buildAttachmentAuditEvent({
      op,
      username: who.user,
      ipAddress: who.ipAddress ?? wikiContext?.request?.ip,
      ...named,
      // Forwarded, never rebuilt — the delegation rides on the caller's
      // context (P1). Without it a token-driven upload records as its owner
      // with no sign a token was involved.
      viaToken: context.viaToken,
      viaProxy: context.viaProxy
    });

    if (op === 'delete') {
      try {
        await recordAuditEvent(sink, event);
      } catch (err) {
        const tagged = err instanceof Error ? err : new Error(String(err));
        (tagged as Error & { code?: string }).code = AUDIT_WRITE_FAILED;
        throw tagged;
      }
    } else {
      await recordAuditEvent(sink, event, (err) =>
        logger.warn(`Audit log failed for attachment.${op} of '${'filename' in detail ? detail.filename : detail.attachmentId}':`, err)
      );
    }
  }

  // ── The Upload file dialog (#2149) ───────────────────────────────────────

  /**
   * What the Upload file dialog offers `ctx` (#2149): every place
   * {@link placesWritableBy} lists, and nothing else, each with the words the
   * user reads; and the one selected at first: where they are working
   * ({@link workingPlaceKey}), else the public place, else the first. Never
   * inferred from whether a page exists. An affordance: nothing is recorded.
   */
  async uploadPlaces(ctx: ActorContext, where: UploadWhere = {}): Promise<{ places: UploadPlace[]; defaultKey: string | null }> {
    const places = (await this.placesWritableBy(ctx)).map((place) => ({ key: FileManager.placeKey(place), label: this.placeLabel(place), place }));
    const keys = places.map(p => p.key);
    const working = this.workingPlaceKey(ctx, where);
    const defaultKey = (working && keys.includes(working) ? working : null)
      ?? (keys.includes('public') ? 'public' : keys[0] ?? null);
    return { places, defaultKey };
  }

  /** The place a dialog key names, when it is one `ctx` may write to (#2149); null otherwise. Never a place it was not offered. */
  async placeForKey(ctx: ActorContext, key: string): Promise<FilePlace | null> {
    if (typeof key !== 'string' || !key) return null;
    return (await this.placesWritableBy(ctx)).find(place => FileManager.placeKey(place) === key) ?? null;
  }

  /** A place's key in the dialog: `public`, `vault:<id>` (always the user's own) or `folder:<name>`. */
  static placeKey(place: FilePlace): string {
    if (place.kind === 'public') return 'public';
    if (place.kind === 'shared-folder') return `folder:${place.folder}`;
    return `vault:${place.vault}`;
  }

  /** The words the user reads for a place. */
  private placeLabel(place: FilePlace): string {
    if (place.kind === 'public') return 'Public files';
    if (place.kind === 'shared-folder') return `Shared folder: ${place.folder}`;
    if (place.vault === this.storeLayout().defaultStoreId) return 'Your private files';
    const category = this.vaultCategory(place.vault);
    const categories = this.configManager()?.getProperty(SYSTEM_CATEGORY_KEY, null) as Record<string, { label?: unknown } | null> | null;
    const label = category ? categories?.[category]?.label : null;
    return typeof label === 'string' && label ? `Your ${label} vault` : `Your vault: ${place.vault}`;
  }

  /**
   * Where the user is working, as a dialog key (#2149): a shared folder's
   * list (`/shared/<folder>`) or one of its pages is that folder; a page in
   * one of their own vaults is that vault. Read from the location, never
   * from whether a page by that name exists; anywhere else is no place.
   */
  private workingPlaceKey(ctx: ActorContext, where: UploadWhere): string | null {
    const folderPath = typeof where.path === 'string' ? /^\/shared\/([^/?#]+)/.exec(where.path) : null;
    if (folderPath) return `folder:${decodeURIComponent(folderPath[1])}`;
    const pageName = typeof where.pageName === 'string' && where.pageName ? where.pageName : null;
    if (!pageName) return null;
    const named = parsePrivatePageName(pageName);
    if (!named) return null;
    if (isSharedFolderOwner(named.owner)) return `folder:${named.store}`;
    return named.owner === ctx.username ? `vault:${named.store}` : null;
  }

  /**
   * The place today's page-tied upload goes to (#1396, #1398, #2125), until
   * #2149/#2150 move its callers to a place the user chose: an upload onto a
   * shared folder's page goes into that folder, saved or not; onto a vault
   * page into that page's vault, by someone who may edit the page; with the
   * Private tick into the uploader's own vault (`store`, or their default);
   * otherwise the public place.
   */
  async placeForPageUpload(ctx: ActorContext, options: Pick<UploadOptions, 'pageName' | 'private' | 'store'>): Promise<FilePlace> {
    const pageName = options.pageName;
    const named = pageName ? parsePrivatePageName(pageName) : null;
    if (named && isSharedFolderOwner(named.owner)) return { kind: 'shared-folder', folder: named.store };
    const pageOwner = pageName
      ? await this.engine.getManager<PageManager>('PageManager')?.getPrivatePageOwner(pageName, ctx) ?? null
      : null;
    if (pageOwner && pageName) {
      // A private container is its owner's: nobody else writes into it unless
      // the owner delegated. The page's own decision, refused before any bytes.
      const attachments = this.engine.getManager<AttachmentManager>('AttachmentManager');
      if (!attachments) throw new Error('FileManager requires AttachmentManager');
      await attachments.assertMayEditPage(ctx, pageName);
      return { kind: 'vault', owner: pageOwner.creator, vault: pageOwner.store };
    }
    if (options.private === true) {
      // A share visitor has no container of their own to put a private file in.
      if (ctx.viaShare) throw new Error('Permission denied: a shared link cannot store private files');
      return { kind: 'vault', owner: ctx.username, vault: options.store ?? this.storeLayout().defaultStoreId };
    }
    return { kind: 'public' };
  }

  /** May `ctx` put a file in `place`? The existing rule for each kind, asked of its owner. */
  private async mayPut(ctx: ActorContext, place: FilePlace): Promise<boolean> {
    if (place.kind === 'public') {
      const pdp = this.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint');
      return pdp ? pdp.permits(ctx, 'asset-upload') : false;
    }
    if (place.kind === 'shared-folder') {
      const folders = this.engine.getManager<SharedFolderManager>('SharedFolderManager');
      return folders ? folders.mayInFolder(ctx, 'asset-upload', place.folder) : false;
    }
    const attachments = this.engine.getManager<AttachmentManager>('AttachmentManager');
    return attachments ? attachments.mayInVault(ctx, 'asset-upload', place.owner, place.vault, 'upload') : false;
  }

  /** The user's own vaults a file may go in: their default vault, and every vault they already have. */
  private async ownVaultIds(ctx: ActorContext): Promise<string[]> {
    const username = ctx.username;
    const pagesDirectory = this.configManager()?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    if (!username || !pagesDirectory) return [];
    const layout = this.storeLayout();
    return [...new Set([layout.defaultStoreId, ...await privateStoreIdsOf(pagesDirectory, username, layout)])];
  }

  private storeLayout(): PrivateStoreLayout {
    const config = this.configManager();
    return privateStoreLayoutFromConfig((key, fallback) => config ? config.getProperty(key, fallback) : fallback);
  }

  /** A well-formed place: a vault is a user's (never the shared folders' container), with valid ids. */
  private static isPlace(place: FilePlace | null | undefined): boolean {
    if (!place || typeof place !== 'object') return false;
    if (place.kind === 'public') return true;
    if (place.kind === 'shared-folder') return typeof place.folder === 'string' && isValidStoreId(place.folder);
    if (place.kind === 'vault') {
      return typeof place.owner === 'string' && place.owner.length > 0 && !isSharedFolderOwner(place.owner)
        && typeof place.vault === 'string' && isValidStoreId(place.vault);
    }
    return false;
  }

  /** A place in a log line. Ids only, never a file's name. */
  private static describePlace(place: FilePlace): string {
    if (place.kind === 'public') return 'the public place';
    if (place.kind === 'shared-folder') return `shared folder '${place.folder}'`;
    return `${place.owner}'s vault '${place.vault}'`;
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
