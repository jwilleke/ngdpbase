import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'crypto';
import BaseManager, { type BackupFolder } from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { PageComment } from '../types/Comment.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
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
import { assertPathSegment } from '../utils/privateStorePath.js';
import type { StoreFileIO } from '../utils/privateStoreFiles.js';
import type IdentityManager from './IdentityManager.js';
import { systemContext, systemPrincipalOf } from '../context/bootActions.js';
import { IDENTITY_ID_PREFIX, sameUsername } from '../utils/username.js';

/** One page's comment folder, and the I/O to read and write it there (#1839). */
interface CommentPlace {
  path: string;
  io: StoreFileIO;
}

export default class CommentManager extends BaseManager {
  private commentsDir: string = './data/comments';
  private enabled: boolean = true;
  /** Vault pages whose comments are still in the public folder (#1839), and the repair's re-check (#1842). */
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
      this.enabled = configManager.getProperty('ngdpbase.comments.allow', true) as boolean;
      this.commentsDir = this.configuredDir();
    }
    if (this.enabled) {
      const preflight = this.preflightConfiguredPath(
        'ngdpbase.comments.storagedir',
        this.commentsDir
      );
      if (!preflight.ok) {
        this.enabled = false;
        logger.info('CommentManager initialized (degraded — comments disabled)');
        return;
      }
      fs.mkdirSync(this.commentsDir, { recursive: true });
      await this.convertAuthorsToIdentityIds();
      await this.outsideCheck.run({ notify: true });
      logger.debug('CommentManager initialized');
    }
  }

  /**
   * Once, at start-up (#2041): every public comment whose `author` is still a
   * username is rewritten with that user's identity `@id`, one write per
   * comment file, under the system context. A value that is already an `@id`
   * (`urn:`), `anonymous` or the system principal is left alone, so a second
   * start writes nothing. A username with no account is left as it is and
   * reported: a log line and the admin dashboard's needs-attention list,
   * counts only. A vault page's comments are in its vault, which start-up
   * does not open; they keep their username, and {@link isAuthor} still
   * matches it. `authorDisplayName` and `deletedBy` are not touched.
   */
  private async convertAuthorsToIdentityIds(): Promise<void> {
    const identities = this.engine.getManager<IdentityManager>('IdentityManager');
    if (!identities) return;
    const ctx = systemContext(this.engine, 'convert comment authors from username to identity @id (#2041)');
    const system = systemPrincipalOf(this.engine);
    const ids = new Map<string, string | null>();
    let converted = 0, unknown = 0;
    for (const page of await fs.readdir(this.commentsDir)) {
      const dir = path.join(this.commentsDir, page);
      if (!(await fs.stat(dir)).isDirectory()) continue;
      for (const name of (await fs.readdir(dir)).filter((f) => f.endsWith('.json'))) {
        const file = path.join(dir, name);
        let comment: PageComment;
        try { comment = JSON.parse(await fs.readFile(file, 'utf8')) as PageComment; } catch { continue; }
        const by = comment?.author;
        if (typeof by !== 'string' || !by || by.startsWith(IDENTITY_ID_PREFIX) || sameUsername(by, 'anonymous') || sameUsername(by, system)) continue;
        if (!ids.has(by)) ids.set(by, (await identities.getByUserIdentifier(ctx, by))?.['@id'] ?? null);
        const id = ids.get(by);
        if (!id) { unknown++; continue; }
        await fs.writeFile(file, JSON.stringify({ ...comment, author: id }, null, 2));
        converted++;
      }
    }
    if (converted > 0) logger.info(`[CommentManager] Converted ${converted} comment author(s) from username to identity @id (#2041)`);
    if (unknown > 0) {
      const reason = `${unknown} comment(s) name an author by a username that has no account, so it cannot be converted to an identity @id; they are left as they are (#2041)`;
      logger.warn(`[CommentManager] ${reason}`);
      this.markNeedsAttention(reason);
    }
  }

  /**
   * Whether `ctx` wrote `comment` (#2041): its `author` is the caller's
   * identity `@id`, or, on a comment written before and not yet converted (a
   * vault page's), the caller's username.
   */
  async isAuthor(comment: Pick<PageComment, 'author'>, ctx: ActorContext): Promise<boolean> {
    if (!ctx.username || !comment.author) return false;
    if (comment.author === ctx.username) return true;
    if (!comment.author.startsWith(IDENTITY_ID_PREFIX)) return false;
    const identity = await this.engine.getManager<IdentityManager>('IdentityManager')
      ?.getByUserIdentifier(systemContext(this.engine, 'is this comment the caller one: their identity @id (#2041)'), ctx.username);
    return Boolean(identity) && identity!['@id'] === comment.author;
  }

  /** `ngdpbase.comments.storagedir`, resolved, or the default when there is no configuration (a test). */
  private configuredDir(): string {
    return this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getResolvedDataPath('ngdpbase.comments.storagedir', './data/comments') ?? this.commentsDir;
  }

  /**
   * The public folder is in the backup (#1876), as `<stem>.comments.tar` beside
   * the document: the public pages' comments. A vault page's are in its vault, which
   * PageManager backs up with the vault, sealed as stored. BackupManager backs
   * it up, stages it, and puts it in place at the next start (#1985).
   */
  override backupFolders(): BackupFolder[] {
    return [{ part: 'comments', folder: this.configuredDir() }];
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** The public folder and the vaults, as configured now (#1839). */
  private roots(): PageNotesRoots {
    return pageNotesRoots(this.engine, 'comments', this.commentsDir);
  }

  /**
   * Where `page`'s comments are (#1839): the public folder for a public page,
   * the page's own vault for a vault page, read and written through that
   * vault's store I/O. A locked vault, or a sealed kind's vault not yet
   * opened, throws: a vault page's comments are never read or written in the
   * clear.
   */
  private place(page: PageRef, ctx: ActorContext): Promise<CommentPlace> {
    return pageNotesPlace(ctx, page, this.roots());
  }

  /**
   * Whether comments are on for `page` (#1951): the page's `comments:` flag,
   * else its system-category's, else on (`pageNotesAllowed`). The view asks
   * this before it shows the Comments tab or the plugin's list, and every
   * write here asks it first. When off, the page's comments are kept and
   * hidden. `metadata` saves a read when the caller already holds it.
   */
  isAllowedOn(page: PageRef, ctx: ActorContext, metadata?: Record<string, unknown> | null): Promise<boolean> {
    return pageNotesAllowed(this.engine, 'comments', page, ctx, metadata);
  }

  /** Throws {@link PageNotesTurnedOffError} when comments are off for `page` (#1951). */
  private async refuseWhenOff(page: PageRef, ctx: ActorContext): Promise<void> {
    if (!await this.isAllowedOn(page, ctx)) throw new PageNotesTurnedOffError('comments');
  }

  private commentFile(place: CommentPlace, commentId: string): string {
    return path.join(place.path, `${assertPathSegment(commentId, 'comment id')}.json`);
  }

  /**
   * A page's comments, read as `ctx` may (#1839). Whether `ctx` may read the
   * page is the caller's to decide, as for the page itself; this finds and
   * opens them.
   */
  async getComments(page: PageRef, ctx: ActorContext): Promise<PageComment[]> {
    const place = await this.place(page, ctx);
    if (!await fs.pathExists(place.path)) return [];

    const files = (await fs.readdir(place.path)).filter(f => f.endsWith('.json'));
    const comments: PageComment[] = [];
    for (const file of files) {
      try {
        const raw = await place.io.readText(path.join(place.path, file));
        const comment = JSON.parse(raw) as PageComment;
        if (!comment.deleted) comments.push(comment);
      } catch {
        // skip corrupt files
      }
    }
    return comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Add a comment on someone's behalf (#1232, security-posture P1).
   *
   * `ctx` is the request's subject — `wikiContext.userContext`, forwarded —
   * or a JobContext for an import; never a name. The author and display
   * name are read from it, and the write is recorded as `comment-create`.
   */
  async addComment(page: PageRef, ctx: ActorContext, content: string): Promise<PageComment> {
    const pageUuid = page.uuid;
    await this.refuseWhenOff(page, ctx);
    const place = await this.place(page, ctx);
    const id = randomUUID();
    const displayName = (ctx as { displayName?: string }).displayName;
    // #2041: the author by identity @id; a name with no account as given.
    const author = (await this.engine.getManager<IdentityManager>('IdentityManager')
      ?.getByUserIdentifier(systemContext(this.engine, 'store a comment author: identity @id (#2041)'), ctx.username))?.['@id'] ?? ctx.username;
    const comment: PageComment = {
      id,
      pageUuid,
      author,
      authorDisplayName: displayName && displayName.trim() ? displayName : ctx.username,
      content,
      createdAt: new Date().toISOString()
    };

    await fs.ensureDir(place.path);
    await place.io.writeText(this.commentFile(place, id), JSON.stringify(comment, null, 2));
    this.invalidateHandlerCache(pageUuid);

    // At the door, after the write, on-failure: continue — the same footing as
    // page-edit. The content itself is never recorded; its length is.
    const who = actorOf(ctx);
    await recordAuditEvent(this.auditSink(), {
      eventType: AUDIT_EVENT.COMMENT_CREATE,
      ...who,
      action: 'comment-create',
      result: 'success',
      severity: 'low',
      resource: id,
      resourceType: 'comment',
      metadata: { ...who.metadata, pageUuid, commentId: id, length: content.length }
    }, (err) => logger.warn(`[CommentManager] Audit record failed for comment-create ${id}:`, err));

    return comment;
  }

  /**
   * Mark a comment deleted on someone's behalf (#1232). Soft: the file stays
   * with `deleted`, `deletedBy`, `deletedAt`. Recorded as `comment-delete`,
   * naming whose comment it was and whether the deleter was its author.
   */
  async deleteComment(page: PageRef, commentId: string, ctx: ActorContext): Promise<boolean> {
    const pageUuid = page.uuid;
    await this.refuseWhenOff(page, ctx);
    const place = await this.place(page, ctx);
    const filePath = this.commentFile(place, commentId);
    if (!await fs.pathExists(filePath)) return false;

    const raw = await place.io.readText(filePath);
    const comment = JSON.parse(raw) as PageComment;
    comment.deleted = true;
    comment.deletedBy = ctx.username;
    comment.deletedAt = new Date().toISOString();
    await place.io.writeText(filePath, JSON.stringify(comment, null, 2));
    this.invalidateHandlerCache(pageUuid);

    const who = actorOf(ctx);
    await recordAuditEvent(this.auditSink(), {
      eventType: AUDIT_EVENT.COMMENT_DELETE,
      ...who,
      action: 'comment-delete',
      result: 'success',
      severity: 'low',
      resource: commentId,
      resourceType: 'comment',
      metadata: { ...who.metadata, pageUuid, commentId, author: comment.author, ownComment: await this.isAuthor(comment, ctx) }
    }, (err) => logger.warn(`[CommentManager] Audit record failed for comment-delete ${commentId}:`, err));

    return true;
  }

  /** Lazily resolved: AuditManager initialises last, and a missing sink is a configuration state, not a failure. */
  private auditSink(): AuditEventSink | null {
    return (this.engine?.getManager?.('AuditManager')) ?? null;
  }

  async getComment(page: PageRef, commentId: string, ctx: ActorContext): Promise<PageComment | null> {
    const place = await this.place(page, ctx);
    const filePath = this.commentFile(place, commentId);
    if (!await fs.pathExists(filePath)) return null;
    try {
      return JSON.parse(await place.io.readText(filePath)) as PageComment;
    } catch {
      return null;
    }
  }

  /**
   * Take a page's comments with it when it changes place (#1839): into a
   * vault, out of one, or between two, through both sides' store I/O as its
   * history goes, sealed into a sealed vault and opened coming out. The page
   * door calls this after the page itself has moved; a rename in place moves
   * nothing.
   */
  async movePageComments(uuid: string, fromName: string, toName: string, ctx: ActorContext): Promise<boolean> {
    return movePageNotes(ctx, uuid, fromName, toName, this.roots());
  }

  /** Vault pages whose comments the last check found in the public folder (#1839): owner, vault, page uuid. */
  vaultPageNotesOutside(): VaultPageNotesOutside[] {
    return this.outsideCheck.findings();
  }

  /** Run that check again (#1842): after a repair, so the subsystem banner clears once nothing is left. */
  async recheckVaultPageNotesOutside(): Promise<VaultPageNotesOutside[]> {
    return this.outsideCheck.run({ notify: false });
  }

  /**
   * Move vault page `uuid`'s comments left in the public folder into its
   * vault (#1842), sealed when the vault is; one the vault already holds is
   * kept. Who may ask, and that `uuid` is a page of `vault`, is the caller's
   * (`PageManager.repairVaultPage`) to decide.
   *
   * @returns how many comment files were (or, with `dryRun`, would be) moved
   */
  async moveOutsideCommentsIntoVault(
    vault: { owner: string; store: string },
    uuid: string,
    ctx: ActorContext,
    opts: { dryRun?: boolean } = {}
  ): Promise<number> {
    return moveOutsideNotesIntoVault(ctx, vault, uuid, this.roots(), opts);
  }

  async shutdown(): Promise<void> {}
}
