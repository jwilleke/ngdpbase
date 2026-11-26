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
  pageNotesPath,
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
import type IdentityManager from './IdentityManager.js';
import { systemContext } from '../context/bootActions.js';
import { IDENTITY_ID_PREFIX, ORPHAN_PREFIX } from '../utils/username.js';
import { FootnoteLinkError, safeSourceUrl, stripUrlCredentials } from '../utils/footnoteLinks.js';
import { SourceStore, SourceMissingError, SourceNotPermittedError, SourceOnPrivatePageError, type SourceRecord } from '../utils/footnoteSources.js';
import { SourceIndex, sourcesCitedIn, type PageCitations } from '../utils/footnoteSourceIndex.js';
import { subjectMayDo } from '../utils/subjectMayDo.js';
import type PageManager from './PageManager.js';
import { parsePrivatePageName } from '../utils/privateStorePath.js';
import { FOOTNOTE_DATA_TOPIC } from '../cache/CacheDependencies.js';

/** Legacy `createdBy` written when footnotes were migrated out of page markup (#128): "no recorded creator", not a username. */
const LEGACY_NO_CREATOR = 'migrated';
/** What it becomes: an orphan sentinel, so `isCreator` never matches it and `isReservedUsername` refuses the prefix; not counted as needing attention. */
const NO_CREATOR = `${ORPHAN_PREFIX}${LEGACY_NO_CREATOR}`;

export interface PageFootnote {
  id: string;
  display: string;
  url: string;
  note: string;
  /** Who added it: their identity `@id` (#2041); a username on a note written before and not yet converted (a vault page's), or one with no account. */
  createdBy: string;
  createdAt: string;
  /**
   * The shared source this footnote points at (#2454), when it has one. While the
   * source's record exists its title and link are what is shown; `display` and
   * `url` are the copy from the last save, shown when the record is gone. Never
   * set on a vault page's footnote (R6).
   */
  sourceId?: string;
}

/** What a footnote is saved with. A `sourceId` makes the source decide the title and link; any `display` or `url` sent with it is ignored. */
export interface FootnoteInput {
  display?: string;
  url?: string;
  note: string;
  sourceId?: string | null;
}

type FootnoteMap = Record<string, PageFootnote>;

/** Where one page's footnotes are, and the I/O to read and write them there (#1839). */
interface FootnotePlace {
  path: string;
  io: StoreFileIO;
}

export default class FootnoteManager extends BaseManager {
  private storageDir: string = './data/footnotes';
  private sourcesDir: string = './data/footnote-sources';
  private enabled: boolean = true;
  /** Which pages cite which source (#2454, R6): in memory only, built from the page list by name. */
  private readonly index = new SourceIndex();
  private rebuilding: Promise<void> | null = null;
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
      this.sourcesDir = this.configuredSourcesDir();
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
      fs.mkdirSync(this.sourcesDir, { recursive: true });
      await this.convertCreatorsToIdentityIds();
      await this.outsideCheck.run({ notify: true });
      logger.debug('FootnoteManager initialized');
    }
  }

  /**
   * Once, at start-up (#2041): every public footnote whose `createdBy` is
   * still a username gets `IdentityManager.convertReference`'s answer, one
   * write per page file, under the system context: that user's identity
   * `@id`, or `orphan:<name>` when the name has no account (nobody's from
   * then on: a later account with that name never takes it over, and only an
   * administrator can delete it). `@id`s, orphans, `anonymous` and the system
   * principal are left alone, so a second start writes nothing. Orphans are
   * reported, counts only (the legacy `migrated` placeholder is `orphan:migrated`
   * and only logged at info, not counted: it has no recorded creator): a log line and the admin dashboard's
   * needs-attention list. When the identity store cannot answer, the whole
   * pass is postponed to the next start and reported the same way. A vault
   * page's footnotes are in its vault, which start-up does not open; they
   * keep their username, and {@link isCreator} still matches it.
   */
  private async convertCreatorsToIdentityIds(): Promise<void> {
    const identities = this.engine.getManager<IdentityManager>('IdentityManager');
    if (!identities) return;
    if (!identities.canAnswer()) {
      this.postponeConversion('the identity store is unavailable');
      return;
    }
    const ctx = systemContext(this.engine, 'convert footnote creators from username to identity @id (#2041)');
    let files = 0, converted = 0, orphans = 0, noCreator = 0;
    try {
      for (const name of (await fs.readdir(this.storageDir)).filter((f) => f.endsWith('.json'))) {
        const file = path.join(this.storageDir, name);
        let map: FootnoteMap;
        try { map = JSON.parse(await fs.readFile(file, 'utf8')) as FootnoteMap; } catch { continue; }
        let changed = false;
        for (const note of Object.values(map)) {
          if (!note || typeof note.createdBy !== 'string') continue;
          // The legacy placeholder is "no recorded creator", not a username: never looked up
          // (an account named "migrated" must not gain these), never counted as an orphan.
          if (note.createdBy === LEGACY_NO_CREATOR || note.createdBy === NO_CREATOR) {
            noCreator++;
            if (note.createdBy !== NO_CREATOR) { note.createdBy = NO_CREATOR; changed = true; }
            continue;
          }
          const { value, outcome } = await identities.convertReference(ctx, note.createdBy);
          if (outcome === 'orphan' || outcome === 'orphaned') orphans++;
          if (outcome === 'converted') converted++;
          if (value !== note.createdBy) { note.createdBy = value; changed = true; }
        }
        if (changed) { await fs.writeFile(file, JSON.stringify(map, null, 2)); files++; }
      }
    } catch (error) {
      this.postponeConversion(error instanceof Error ? error.message : String(error));
      return;
    }
    if (converted > 0) logger.info(`[FootnoteManager] Converted ${converted} footnote creator(s) in ${files} page file(s) from username to identity @id (#2041)`);
    if (noCreator > 0) logger.info(`[FootnoteManager] ${noCreator} footnote(s) have no recorded creator (migrated before creators were kept); only an administrator can delete them`);
    if (orphans > 0) {
      // #2097: an orphan is the intended final state and needs nothing from an administrator, so it is logged at info and never marked needs-attention.
      logger.info(`[FootnoteManager] ${orphans} footnote(s) are orphaned: their creator's username has no account, so only an administrator can delete them (#2041)`);
    }
  }

  /** The identity store could not answer: nothing more is converted this start, and the next start tries again (#2041). */
  private postponeConversion(why: string): void {
    logger.warn(`[FootnoteManager] Footnote creators were not converted to identity @ids: identity store unavailable, conversion postponed to the next start (#2041): ${why}`);
    // #2354: the dashboard says it in plain words; the developer detail is in the line above.
    this.markNeedsAttention('Some footnotes still name their authors the old way, because the contacts were not available when the site started. Restart the site to try again.');
  }

  /**
   * Whether `ctx` added `footnote` (#2041): its `createdBy` is the caller's
   * identity `@id`, or, on a footnote written before and not yet converted
   * (a vault page's), the caller's username. An orphan (`orphan:<name>`)
   * is nobody's and never matches; neither does the legacy `migrated`
   * placeholder (no recorded creator), on a footnote not yet converted.
   */
  async isCreator(footnote: Pick<PageFootnote, 'createdBy'>, ctx: ActorContext): Promise<boolean> {
    if (!ctx.username || !footnote.createdBy || footnote.createdBy.startsWith(ORPHAN_PREFIX) || footnote.createdBy === LEGACY_NO_CREATOR) return false;
    if (footnote.createdBy === ctx.username) return true;
    if (!footnote.createdBy.startsWith(IDENTITY_ID_PREFIX)) return false;
    const id = await this.engine.getManager<IdentityManager>('IdentityManager')
      ?.identityIdOf(systemContext(this.engine, 'is this footnote the caller one: their identity @id (#2041)'), ctx.username);
    return Boolean(id) && id === footnote.createdBy;
  }

  /** `ngdpbase.footnotes.storagedir`, resolved, or the default when there is no configuration (a test). */
  private configuredDir(): string {
    return this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getResolvedDataPath('ngdpbase.footnotes.storagedir', './data/footnotes') ?? this.storageDir;
  }

  /** `ngdpbase.footnotes.sources.storagedir`, resolved (#2454): the shared source records, one file each. */
  private configuredSourcesDir(): string {
    return this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getResolvedDataPath('ngdpbase.footnotes.sources.storagedir', './data/footnote-sources') ?? this.sourcesDir;
  }

  /**
   * The public folder is in the backup (#1876), as `<stem>.footnotes.tar` beside
   * the document: the public pages' footnotes. A vault page's are in its vault, which
   * PageManager backs up with the vault, sealed as stored. The shared source
   * records are a part of their own, `<stem>.footnote-sources.tar` (#2454),
   * optional: a backup made before sources existed has none, and restoring it
   * leaves the folder as it is. BackupManager backs
   * them up, stages them, and puts them in place at the next start (#1985).
   */
  override backupFolders(): BackupFolder[] {
    return [
      { part: 'footnotes', folder: this.configuredDir() },
      { part: 'footnote-sources', folder: this.configuredSourcesDir(), optional: true }
    ];
  }

  private sources(): SourceStore {
    return new SourceStore(this.sourcesDir);
  }

  /**
   * Makes a shared footnote source (#2454): a title and an http or https link,
   * kept in its own folder, announced to the cache and recorded as
   * `footnote-edit` / `create`. `ctx` must hold the `page-edit` permission, asked
   * here as well as by the route (R7); a username or password in the link is
   * removed (Jim, 2026-11-23).
   *
   * @throws SourceNotPermittedError when `ctx` does not hold `page-edit`
   * @throws FootnoteLinkError when the link is not http or https
   */
  async createSource(data: { title: string; url: string }, ctx: ActorContext): Promise<SourceRecord> {
    if (!this.enabled) throw new Error('Footnotes are turned off on this site, so a source can\'t be added.');
    if (!await subjectMayDo(this.engine, ctx, 'page-edit')) throw new SourceNotPermittedError();
    const createdBy = (await this.engine.getManager<IdentityManager>('IdentityManager')
      ?.identityIdOf(systemContext(this.engine, 'store a footnote source creator: identity @id (#2454)'), ctx.username)) ?? ctx.username;
    const source = await this.sources().create({ title: data.title, url: data.url, createdBy });
    await this.bumpFootnotes();
    await this.recordSourceEdit('create', source.id, ctx);
    return source;
  }

  /**
   * The source with this id as `ctx` may see it (R4), or null: no such source, or
   * the reader filter hides it. A hidden source is indistinguishable from a
   * missing one.
   */
  async getSource(id: string, ctx: ActorContext): Promise<SourceRecord | null> {
    const record = await this.sources().get(id);
    return record && await this.canSeeSource(record.id, ctx) ? record : null;
  }

  /**
   * The reader filter (R4, Jim's decisions 2, 10 and 12): `ctx` sees a source when at
   * least one page that cites it passes `filterPagesFor` with their own context, or
   * when no page cites it and they hold the `page-edit` permission.
   */
  async canSeeSource(sourceId: string, ctx: ActorContext): Promise<boolean> {
    const citing = await this.citingPages(sourceId);
    if (citing.length === 0) return this.holdsPageEdit(ctx);
    return (await this.viewable(citing.map((p) => p.name), ctx)).length > 0;
  }

  /** The names of the citing pages `ctx` may view, in page-name order; those pages only, never the rest. */
  async citingPagesFor(sourceId: string, ctx: ActorContext): Promise<string[]> {
    return this.viewable((await this.citingPages(sourceId)).map((p) => p.name), ctx);
  }

  /**
   * Every source `ctx` may see, oldest first, with the citing pages they may view
   * and whether no page cites it ("Not used"). One `filterPagesFor` call decides
   * all the citing pages.
   */
  async listSourcesFor(ctx: ActorContext): Promise<Array<{ source: SourceRecord; citedBy: string[]; used: boolean }>> {
    return this.visibleOf(await this.sources().list(), ctx);
  }

  /** The sources with this tidy key `ctx` may see, oldest first: what the add form offers (R2). Hidden ones are left out, never named. */
  async findSourcesFor(urlKey: string, ctx: ActorContext): Promise<SourceRecord[]> {
    return (await this.visibleOf(await this.sources().findByKey(urlKey), ctx)).map((e) => e.source);
  }

  private async visibleOf(records: SourceRecord[], ctx: ActorContext): Promise<Array<{ source: SourceRecord; citedBy: string[]; used: boolean }>> {
    if (records.length === 0) return [];
    const citing = new Map<string, string[]>();
    for (const r of records) citing.set(r.id, (await this.citingPages(r.id)).map((p) => p.name));
    const viewable = new Set(await this.viewable([...new Set([...citing.values()].flat())], ctx));
    const editor = [...citing.values()].some((names) => names.length === 0) ? await this.holdsPageEdit(ctx) : false;
    const shown: Array<{ source: SourceRecord; citedBy: string[]; used: boolean }> = [];
    for (const source of records) {
      const names = citing.get(source.id) ?? [];
      const citedBy = names.filter((n) => viewable.has(n));
      if (names.length === 0 ? editor : citedBy.length > 0) shown.push({ source, citedBy, used: names.length > 0 });
    }
    return shown;
  }

  /** `filterPagesFor` for `ctx`, in the order given. With no page manager nothing is viewable. */
  private async viewable(names: string[], ctx: ActorContext): Promise<string[]> {
    if (names.length === 0) return [];
    const pages = this.engine.getManager<PageManager>('PageManager');
    return pages ? pages.filterPagesFor(ctx, names) : [];
  }

  /** Whether `ctx` holds the `page-edit` permission: policy alone, for the "Not used" part of the reader filter (an affordance, never a door). */
  private async holdsPageEdit(ctx: ActorContext): Promise<boolean> {
    const pdp = this.engine.getManager<{ holds?(s: ActorContext, a: string): Promise<boolean> }>('PolicyDecisionPoint');
    if (pdp?.holds) return pdp.holds(ctx, 'page-edit');
    return subjectMayDo(this.engine, ctx, 'page-edit');
  }

  /** The public pages that cite `sourceId` now, by name. Not filtered for any reader: for counts and for the filter itself. */
  async citingPages(sourceId: string): Promise<PageRef[]> {
    await this.ensureIndex();
    const uuids = this.index.pagesFor(sourceId);
    if (uuids.length === 0) return [];
    const byUuid = new Map((await this.publicPages()).map((p) => [p.uuid, p]));
    return uuids.map((u) => byUuid.get(u)).filter((p): p is PageRef => Boolean(p)).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** How many public pages cite `sourceId`, every one counted, a number only (R7 "Used on N pages"; the delete re-check). */
  async citationCount(sourceId: string): Promise<number> {
    return (await this.citingPages(sourceId)).length;
  }

  /** The public pages and their uuids, by name; a vault name is dropped even if the page list gives one (R6). */
  private async publicPages(): Promise<PageRef[]> {
    const refs = (await this.engine.getManager<PageManager>('PageManager')?.listPageRefs()) ?? [];
    return refs.filter((p) => !parsePrivatePageName(p.name));
  }

  /** What a public page's footnote file cites, read by `{ name, uuid }`; null for a page with no readable file. */
  private async readCitations(page: PageRef): Promise<PageCitations | null> {
    try {
      const file = pageNotesPath(page, this.roots()).path;
      if (!await fs.pathExists(file)) return null;
      return sourcesCitedIn(JSON.parse(await fs.readFile(file, 'utf8')));
    } catch {
      return null;
    }
  }

  /**
   * Builds the index again from the page list (R6): the names come from the page
   * manager, a vault name is dropped, and each remaining page's footnote file
   * is opened by `{ name, uuid }`. No folder is listed, so a stray vault
   * footnote file in the public folder is never read. Run at start-up, and on first
   * use if nobody has yet. A write that lands while it runs can be missed until that
   * page changes again or the next start.
   */
  async rebuildSourceIndex(): Promise<void> {
    const pages = new Map<string, PageCitations>();
    for (const page of await this.publicPages()) {
      const found = await this.readCitations(page);
      if (found && Object.keys(found).length > 0) pages.set(page.uuid, found);
    }
    this.index.replaceAll(pages);
  }

  private async ensureIndex(): Promise<void> {
    if (this.index.built) return;
    this.rebuilding ??= this.rebuildSourceIndex().finally(() => { this.rebuilding = null; });
    await this.rebuilding;
  }

  /** A footnote write on `page` changed what it cites. A vault page never enters the index. */
  private indexWritten(page: PageRef, map: FootnoteMap | null): void {
    if (!this.index.built || parsePrivatePageName(page.name)) return;
    this.index.setPage(page.uuid, map ? sourcesCitedIn(map) : {});
  }

  /** Reads `uuid`'s file again into the index: for a public page, else takes the page out. */
  private async reindexPage(uuid: string, name: string | null): Promise<void> {
    if (!this.index.built) return;
    if (!name || parsePrivatePageName(name)) {
      this.index.removePage(uuid);
      return;
    }
    this.index.setPage(uuid, (await this.readCitations({ name, uuid })) ?? {});
  }

  /**
   * A page was deleted, restored, created or renamed (`PageManager`'s one place for
   * keeping indexes in step): the index follows. A page that is now in a vault, or
   * gone, leaves it.
   */
  async pageChanged(change: { uuid: string; name: string | null; previousName: string | null }): Promise<void> {
    await this.reindexPage(change.uuid, change.name);
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

  private async writeMap(place: FootnotePlace, map: FootnoteMap, page: PageRef): Promise<void> {
    await fs.ensureDir(path.dirname(place.path));
    await place.io.writeText(place.path, JSON.stringify(map, null, 2));
    this.indexWritten(page, map);
    await this.bumpFootnotes();
  }

  /** A page's footnote file changed: every cached render that read footnotes re-renders (#2454). A failed bump never fails the write. */
  private async bumpFootnotes(): Promise<void> {
    try {
      await this.engine.getManager<{ bump(topic: string): Promise<string> }>('CacheManager')?.bump(FOOTNOTE_DATA_TOPIC);
    } catch { /* the write stands; a render may stay stale until its next change */ }
  }

  /**
   * A footnote's link, as it is stored: empty (a note with no link) or an http or
   * https address, without any username or password in it (Jim, 2026-11-23: removed,
   * not refused); anything else is refused.
   */
  private checkedUrl(url: string): string {
    const trimmed = url.trim();
    if (trimmed && !safeSourceUrl(trimmed)) throw new FootnoteLinkError();
    return stripUrlCredentials(trimmed);
  }

  /**
   * A page's footnotes, read as `ctx` may (#1839). Whether `ctx` may read the
   * page is the caller's to decide, as for the page itself; this finds and
   * opens them.
   */
  async getFootnotes(page: PageRef, ctx: ActorContext): Promise<PageFootnote[]> {
    const map = await this.readMap(await this.place(page, ctx));
    const notes = Object.values(map).sort((a, b) => {
      const na = parseInt(a.id, 10), nb = parseInt(b.id, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.id.localeCompare(b.id);
    });
    // R6: a vault page never has a source, so one named in its file is not looked up.
    if (parsePrivatePageName(page.name)) return notes;
    return Promise.all(notes.map((n) => this.withSource(n)));
  }

  /**
   * Which copy wins (#2454): while the footnote's source has a record, its
   * title and link are shown; with no record, the footnote's stored copy.
   */
  private async withSource(note: PageFootnote): Promise<PageFootnote> {
    if (!note.sourceId) return note;
    const source = await this.sources().get(note.sourceId);
    return source ? { ...note, display: source.title, url: source.url } : note;
  }

  /**
   * The title and link a footnote saves for `sourceId`: the source's now. Vault
   * pages never use a source (R6), so that is refused first, whether or not
   * the source exists; then a source with no record is refused.
   */
  private async sourceCopy(page: PageRef, sourceId: string, ctx: ActorContext): Promise<{ sourceId: string; display: string; url: string }> {
    if (parsePrivatePageName(page.name)) throw new SourceOnPrivatePageError();
    // R4: a source the reader filter hides from this person is answered as a missing one, so its title is not given away.
    const source = await this.getSource(sourceId, ctx);
    if (!source) throw new SourceMissingError();
    return { sourceId: source.id, display: source.title, url: source.url };
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
    data: FootnoteInput,
    ctx: ActorContext
  ): Promise<PageFootnote> {
    const pageUuid = page.uuid;
    await this.refuseWhenOff(page, ctx);
    const source = data.sourceId ? await this.sourceCopy(page, data.sourceId, ctx) : null;
    const url = source ? source.url : this.checkedUrl(data.url ?? '');
    // #2041: the creator by identity @id; a name with no account as given.
    const createdBy = (await this.engine.getManager<IdentityManager>('IdentityManager')
      ?.identityIdOf(systemContext(this.engine, 'store a footnote creator: identity @id (#2041)'), ctx.username)) ?? ctx.username;
    const place = await this.place(page, ctx);
    const map = await this.readMap(place);

    // Assign next sequential numeric id
    const numericIds = Object.keys(map).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
    const nextId = String(numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1);

    const footnote: PageFootnote = {
      id: nextId,
      display: source ? source.display : (data.display ?? '').trim(),
      url,
      note: data.note.trim(),
      createdBy,
      createdAt: new Date().toISOString(),
      ...(source ? { sourceId: source.sourceId } : {})
    };

    map[nextId] = footnote;
    await this.writeMap(place, map, page);
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
    // #2041: the creator by identity @id; a name with no account as given.
    const createdBy = (await this.engine.getManager<IdentityManager>('IdentityManager')
      ?.identityIdOf(systemContext(this.engine, 'store a footnote creator: identity @id (#2041)'), ctx.username)) ?? ctx.username;
    const place = await this.place(page, ctx);
    const map = await this.readMap(place);
    if (map[id]) return false;

    map[id] = {
      id,
      display: data.display.trim(),
      url: stripUrlCredentials(data.url),
      note: data.note.trim(),
      createdBy,
      createdAt: new Date().toISOString()
    };
    await this.writeMap(place, map, page);
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
    data: FootnoteInput,
    ctx: ActorContext
  ): Promise<PageFootnote | null> {
    const pageUuid = page.uuid;
    await this.refuseWhenOff(page, ctx);
    // A new source decides the title and link. `null` makes the footnote a page note again, with the title
    // and link given (checked like any link) or, when none are given, the stored copy. With no `sourceId`
    // at all, a sourced footnote keeps its source and only its note changes; a page note changes as it always did.
    const source = data.sourceId ? await this.sourceCopy(page, data.sourceId, ctx) : null;
    const place = await this.place(page, ctx);
    const map = await this.readMap(place);
    if (!map[id]) {
      if (!source) this.checkedUrl(data.url ?? '');
      return null;
    }
    const { sourceId: current, ...rest } = map[id];
    const keepSource = !source && data.sourceId === undefined && Boolean(current);
    if (source) {
      map[id] = { ...rest, display: source.display, url: source.url, note: data.note.trim(), sourceId: source.sourceId };
    } else if (keepSource) {
      const shown = await this.withSource(map[id]);
      map[id] = { ...rest, display: shown.display, url: shown.url, note: data.note.trim(), sourceId: current };
    } else {
      const toPageNote = data.sourceId === null && data.display === undefined && data.url === undefined;
      map[id] = {
        ...rest,
        display: toPageNote ? rest.display : (data.display ?? '').trim(),
        url: toPageNote ? rest.url : this.checkedUrl(data.url ?? ''),
        note: data.note.trim()
      };
    }
    await this.writeMap(place, map, page);
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
    const ownFootnote = await this.isCreator(map[id], ctx);

    delete map[id];

    if (Object.keys(map).length === 0) {
      // Remove the file entirely when no footnotes remain
      await fs.remove(place.path);
      this.indexWritten(page, null);
      await this.bumpFootnotes();
    } else {
      await this.writeMap(place, map, page);
    }
    this.invalidateHandlerCache(pageUuid);
    await this.recordEdit('delete', pageUuid, ctx, { footnoteId: id, createdBy, ownFootnote });
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

  /** `footnote-edit` for a source change (#2454): the source's id only, never its title or link, and no page. */
  private async recordSourceEdit(action: 'create', sourceId: string, ctx: ActorContext): Promise<void> {
    const who = actorOf(ctx);
    const sink = (this.engine?.getManager?.('AuditManager')) ?? null;
    await recordAuditEvent(sink, {
      eventType: AUDIT_EVENT.FOOTNOTE_EDIT,
      ...who,
      action,
      result: 'success',
      severity: 'low',
      resource: sourceId,
      resourceType: 'footnote-source',
      metadata: { ...who.metadata, sourceId }
    }, (err) => logger.warn(`[FootnoteManager] Audit record failed for footnote-edit/${action} on source ${sourceId}:`, err));
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
    const moved = await movePageNotes(ctx, uuid, fromName, toName, this.roots());
    if (!moved) return moved;
    try {
      if (parsePrivatePageName(toName) && !parsePrivatePageName(fromName)) await this.stripSources({ name: toName, uuid }, ctx);
    } finally {
      // The index and the cache follow the move even when taking the sources off the notes failed.
      await this.reindexPage(uuid, toName);
      await this.bumpFootnotes();
    }
    return moved;
  }

  /**
   * R6 (#2454): a page that has just moved into a vault keeps no source. Each
   * footnote that had one becomes a page note carrying the source's title and
   * link as they are now (the stored copy when the record is gone), written
   * back through the vault's own I/O.
   */
  private async stripSources(page: PageRef, ctx: ActorContext): Promise<void> {
    const place = await this.place(page, ctx);
    const map = await this.readMap(place);
    let changed = false;
    for (const note of Object.values(map)) {
      if (!note.sourceId) continue;
      const shown = await this.withSource(note);
      map[note.id] = { ...note, display: shown.display, url: shown.url };
      delete map[note.id].sourceId;
      changed = true;
    }
    if (changed) await place.io.writeText(place.path, JSON.stringify(map, null, 2));
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
    const moved = await moveOutsideNotesIntoVault(ctx, vault, uuid, this.roots(), opts);
    if (moved > 0 && !opts.dryRun) await this.bumpFootnotes();
    return moved;
  }

  async shutdown(): Promise<void> {}
}
