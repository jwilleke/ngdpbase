import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import BaseManager, { type BackupFolder } from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import { recordAuditEvent } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import {
  movePageNotes,
  pageNotesPlace,
  pageNotesRoots,
  moveOutsideNotesIntoVault,
  pageNotesAllowed,
  PageNotesTurnedOffError,
  VaultPageNotesCheck,
  type VaultPageNotesOutside,
  type PageNotesRoots,
  type PageRef
} from '../utils/pageNotes.js';
import type { StoreFileIO } from '../utils/privateStoreFiles.js';

export interface PageFootnote {
  id: string;
  display: string;
  url: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

type FootnoteMap = Record<string, PageFootnote>;

/** Where one page's footnotes are, and the I/O to read and write them there (#1839). */
interface FootnotePlace {
  path: string;
  io: StoreFileIO;
}

export default class FootnoteManager extends BaseManager {
  private storageDir: string = './data/footnotes';
  private enabled: boolean = true;
  /** Vault pages whose footnotes are still in the public folder (#1839), and the repair's re-check (#1842). */
  private readonly outsideCheck = new VaultPageNotesCheck(this.engine, () => this.roots(), {
    markNeedsAttention: (reason) => this.markNeedsAttention(reason),
    markReadyIfDegradedBy: (reason) => this.markReadyIfDegradedBy(reason)
  });

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(): Promise<void> {
    // #1985: a staged site restore of the folder goes in here, before anything is read.
    await super.initialize();
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (configManager) {
      this.enabled = configManager.getProperty('ngdpbase.footnotes.enabled', true) as boolean;
      this.storageDir = this.configuredDir();
    }
    if (this.enabled) {
      const preflight = this.preflightConfiguredPath(
        'ngdpbase.footnotes.storagedir',
        this.storageDir
      );
      if (!preflight.ok) {
        this.enabled = false;
        logger.info('FootnoteManager initialized (degraded — footnotes disabled)');
        return;
      }
      fs.mkdirSync(this.storageDir, { recursive: true });
      await this.outsideCheck.run({ notify: true });
      logger.debug('FootnoteManager initialized');
    }
  }

  /** `ngdpbase.footnotes.storagedir`, resolved, or the default when there is no configuration (a test). */
  private configuredDir(): string {
    return this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getResolvedDataPath('ngdpbase.footnotes.storagedir', './data/footnotes') ?? this.storageDir;
  }

  /**
   * The public folder is in the backup (#1876), as `<stem>.footnotes.tar` beside
   * the document: the public pages' footnotes. A vault page's are in its vault, which
   * PageManager backs up with the vault, sealed as stored. BackupManager backs
   * it up, stages it, and puts it in place at the next start (#1985).
   */
  override backupFolders(): BackupFolder[] {
    return [{ part: 'footnotes', folder: this.configuredDir() }];
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** The public folder and the vaults, as configured now (#1839). */
  private roots(): PageNotesRoots {
    return pageNotesRoots(this.engine, 'footnotes', this.storageDir);
  }

  /**
   * Where `page`'s footnotes are (#1839): the public folder for a public page,
   * the page's own vault for a vault page, read and written through that
   * vault's store I/O. A locked vault, or a sealed kind's vault not yet
   * opened, throws: a vault page's footnotes are never read or written in
   * the clear.
   */
  private place(page: PageRef, ctx: ActorContext): Promise<FootnotePlace> {
    return pageNotesPlace(ctx, page, this.roots());
  }

  /**
   * Whether footnotes are on for `page` (#1951): the page's `footnotes:` flag,
   * else its system-category's, else on (`pageNotesAllowed`). Each page is
   * asked about itself, so one page's flag never reaches another's. The view
   * asks this before it shows the Footnotes tab, and every write here asks it
   * first. When off, the page's footnotes are kept and stay readable where
   * the page's own content lists them (`[{FootnotesPlugin}]`), without the
   * add, edit and delete controls. `metadata` saves a read when the caller
   * already holds it.
   */
  isAllowedOn(page: PageRef, ctx: ActorContext, metadata?: Record<string, unknown> | null): Promise<boolean> {
    return pageNotesAllowed(this.engine, 'footnotes', page, ctx, metadata);
  }

  /** Throws {@link PageNotesTurnedOffError} when footnotes are off for `page` (#1951). */
  private async refuseWhenOff(page: PageRef, ctx: ActorContext): Promise<void> {
    if (!await this.isAllowedOn(page, ctx)) throw new PageNotesTurnedOffError('footnotes');
  }

  private async readMap(place: FootnotePlace): Promise<FootnoteMap> {
    if (!await fs.pathExists(place.path)) return {};
    const text = await place.io.readText(place.path);
    try {
      return JSON.parse(text) as FootnoteMap;
    } catch {
      return {};
    }
  }

  private async writeMap(place: FootnotePlace, map: FootnoteMap): Promise<void> {
    await fs.ensureDir(path.dirname(place.path));
    await place.io.writeText(place.path, JSON.stringify(map, null, 2));
  }

  /**
   * A page's footnotes, read as `ctx` may (#1839). Whether `ctx` may read the
   * page is the caller's to decide, as for the page itself; this finds and
   * opens them.
   */
  async getFootnotes(page: PageRef, ctx: ActorContext): Promise<PageFootnote[]> {
    const map = await this.readMap(await this.place(page, ctx));
    return Object.values(map).sort((a, b) => {
      const na = parseInt(a.id, 10), nb = parseInt(b.id, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Add a footnote on someone's behalf (#1233, security-posture P1).
   *
   * `ctx` is the request's subject — `wikiContext.userContext`, forwarded —
   * or a JobContext for an import; never a name. `createdBy` is read from
   * it, and the write is recorded as `footnote-edit` / `add`.
   */
  async addFootnote(
    page: PageRef,
    data: { display: string; url: string; note: string },
    ctx: ActorContext
  ): Promise<PageFootnote> {
    const pageUuid = page.uuid;
    const createdBy = ctx.username;
    await this.refuseWhenOff(page, ctx);
    const place = await this.place(page, ctx);
    const map = await this.readMap(place);

    // Assign next sequential numeric id
    const numericIds = Object.keys(map).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
    const nextId = String(numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1);

    const footnote: PageFootnote = {
      id: nextId,
      display: data.display.trim(),
      url: data.url.trim(),
      note: data.note.trim(),
      createdBy,
      createdAt: new Date().toISOString()
    };

    map[nextId] = footnote;
    await this.writeMap(place, map);
    this.invalidateHandlerCache(pageUuid);
    await this.recordEdit('add', pageUuid, ctx, { footnoteId: nextId });
    return footnote;
  }

  /**
   * #1125: import a footnote with an EXPLICIT id — the NCM conversion path.
   *
   * Unlike {@link addFootnote}, which assigns the next sequential id, this
   * preserves the author's id verbatim: the body's `[^note-1]` refs resolve
   * to `#footnote-note-1` in the rendered list, so renumbering would break
   * every ref. Refuses to clobber an existing id (returns false) — the
   * caller surfaces that as a warning and leaves the body definition alone.
   */
  async importFootnote(
    page: PageRef,
    id: string,
    data: { display: string; url: string; note: string },
    ctx: ActorContext
  ): Promise<boolean> {
    await this.refuseWhenOff(page, ctx);
    const ok = await this.putImported(page, id, data, ctx);
    if (ok) await this.recordEdit('import', page.uuid, ctx, { footnoteId: id });
    return ok;
  }

  /** The write behind `importFootnote` and `transferFromContent`; the callers record it, once each. */
  private async putImported(page: PageRef, id: string, data: { display: string; url: string; note: string }, ctx: ActorContext): Promise<boolean> {
    const createdBy = ctx.username;
    const place = await this.place(page, ctx);
    const map = await this.readMap(place);
    if (map[id]) return false;

    map[id] = {
      id,
      display: data.display.trim(),
      url: data.url.trim(),
      note: data.note.trim(),
      createdBy,
      createdAt: new Date().toISOString()
    };
    await this.writeMap(place, map);
    this.invalidateHandlerCache(page.uuid);
    return true;
  }

  /**
   * #1125/#1126: transfer `[^id]: text` definitions from a body into this
   * sidecar, returning the rewritten body. THE one implementation — the
   * convert route, agent ingest, and ImportManager all delegate here, so the
   * funnel cannot drift per-path. dryRun reports and rewrites without
   * writing. A colliding id keeps its body definition and warns.
   */
  async transferFromContent(
    page: PageRef,
    content: string,
    ctx: ActorContext,
    dryRun: boolean
  ): Promise<{ content: string; warnings: string[] }> {
    if (!this.enabled) return { content, warnings: [] };
    const { extractFootnoteDefs, ensureFootnotesPlugin } = await import('../converters/ncm/footnotes.js');
    const extracted = extractFootnoteDefs(content);
    if (extracted.defs.length === 0) return { content, warnings: [] };
    // #1951: the frontmatter being saved is the page's, when the text carries
    // one; otherwise the stored page's. Off: nothing moves, the body keeps its
    // definitions as written.
    let frontmatter: Record<string, unknown> = {};
    try { frontmatter = matter(content).data; } catch { /* no readable frontmatter: the stored page's decides */ }
    if (!await this.isAllowedOn(page, ctx, Object.keys(frontmatter).length > 0 ? frontmatter : undefined)) {
      return { content, warnings: ['footnotes-off: footnotes are turned off for this page; body definitions kept'] };
    }

    const warnings: string[] = [];
    const kept: string[] = [];
    const transferred: string[] = [];
    const skipped: string[] = [];
    for (const def of extracted.defs) {
      if (dryRun) {
        warnings.push(`footnote-transferred: [^${def.id}] → footnote list`);
        continue;
      }
      const ok = await this.putImported(page, def.id, def, ctx);
      if (ok) {
        transferred.push(def.id);
        warnings.push(`footnote-transferred: [^${def.id}] → footnote list`);
      } else {
        skipped.push(def.id);
        warnings.push(`footnote-skipped-exists: [^${def.id}] already in the footnote list; body definition kept`);
        kept.push(`[^${def.id}]: ${def.display && def.url ? `[${def.display}](${def.url})` : def.url || def.note}`);
      }
    }
    const body = kept.length > 0
      ? `${extracted.content.replace(/\s*$/, '')}\n\n${kept.join('\n')}\n`
      : extracted.content;
    // One record for the whole transfer; a dry run writes nothing and records nothing.
    if (!dryRun && transferred.length > 0) {
      await this.recordEdit('transfer', page.uuid, ctx, { footnoteIds: transferred, skipped });
    }
    return { content: ensureFootnotesPlugin(body), warnings };
  }

  async updateFootnote(
    page: PageRef,
    id: string,
    data: { display: string; url: string; note: string },
    ctx: ActorContext
  ): Promise<PageFootnote | null> {
    const pageUuid = page.uuid;
    await this.refuseWhenOff(page, ctx);
    const place = await this.place(page, ctx);
    const map = await this.readMap(place);
    if (!map[id]) return null;

    map[id] = {
      ...map[id],
      display: data.display.trim(),
      url: data.url.trim(),
      note: data.note.trim()
    };
    await this.writeMap(place, map);
    this.invalidateHandlerCache(pageUuid);
    await this.recordEdit('update', pageUuid, ctx, { footnoteId: id });
    return map[id];
  }

  async deleteFootnote(page: PageRef, id: string, ctx: ActorContext): Promise<boolean> {
    const pageUuid = page.uuid;
    await this.refuseWhenOff(page, ctx);
    const place = await this.place(page, ctx);
    const map = await this.readMap(place);
    if (!map[id]) return false;
    const createdBy = map[id].createdBy;

    delete map[id];

    if (Object.keys(map).length === 0) {
      // Remove the file entirely when no footnotes remain
      await fs.remove(place.path);
    } else {
      await this.writeMap(place, map);
    }
    this.invalidateHandlerCache(pageUuid);
    await this.recordEdit('delete', pageUuid, ctx, { footnoteId: id, createdBy, ownFootnote: createdBy === ctx.username });
    return true;
  }

  /**
   * `footnote-edit`, attributed from the context (#1233). Ids only — display,
   * url and note are content, and the record does not repeat content.
   * on-failure: continue, the page-edit footing.
   */
  private async recordEdit(
    action: 'add' | 'import' | 'transfer' | 'update' | 'delete',
    pageUuid: string,
    ctx: ActorContext,
    detail: Record<string, unknown>
  ): Promise<void> {
    const who = actorOf(ctx);
    const sink = (this.engine?.getManager?.('AuditManager')) ?? null;
    await recordAuditEvent(sink, {
      eventType: AUDIT_EVENT.FOOTNOTE_EDIT,
      ...who,
      action,
      result: 'success',
      severity: 'low',
      resource: pageUuid,
      resourceType: 'page',
      metadata: { ...who.metadata, pageUuid, ...detail }
    }, (err) => logger.warn(`[FootnoteManager] Audit record failed for footnote-edit/${action} on ${pageUuid}:`, err));
  }

  async hasFootnotes(page: PageRef, ctx: ActorContext): Promise<boolean> {
    return Object.keys(await this.readMap(await this.place(page, ctx))).length > 0;
  }

  /**
   * Take a page's footnotes with it when it changes place (#1839): into a
   * vault, out of one, or between two, through both sides' store I/O as its
   * history goes, sealed into a sealed vault and opened coming out. The page
   * door calls this after the page itself has moved; a rename in place moves
   * nothing.
   */
  async movePageFootnotes(uuid: string, fromName: string, toName: string, ctx: ActorContext): Promise<boolean> {
    return movePageNotes(ctx, uuid, fromName, toName, this.roots());
  }

  /** Vault pages whose footnotes the last check found in the public folder (#1839): owner, vault, page uuid. */
  vaultPageNotesOutside(): VaultPageNotesOutside[] {
    return this.outsideCheck.findings();
  }

  /** Run that check again (#1842): after a repair, so the subsystem banner clears once nothing is left. */
  async recheckVaultPageNotesOutside(): Promise<VaultPageNotesOutside[]> {
    return this.outsideCheck.run({ notify: false });
  }

  /**
   * Move vault page `uuid`'s footnotes left in the public folder into its
   * vault (#1842), sealed when the vault is; merged with any the vault already
   * has. Who may ask, and that `uuid` is a page of `vault`, is the caller's
   * (`PageManager.repairVaultPage`) to decide.
   *
   * @returns how many footnotes were (or, with `dryRun`, would be) moved
   */
  async moveOutsideFootnotesIntoVault(
    vault: { owner: string; store: string },
    uuid: string,
    ctx: ActorContext,
    opts: { dryRun?: boolean } = {}
  ): Promise<number> {
    return moveOutsideNotesIntoVault(ctx, vault, uuid, this.roots(), opts);
  }

  async shutdown(): Promise<void> {}
}
