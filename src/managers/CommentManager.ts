import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'crypto';
import BaseManager, { type BackupData, type ManagerBackupOptions, type ManagerRestoreOptions } from './BaseManager.js';
import { applyDirectoryPartAtStart, backupDirectoryPart, stageDirectoryPart } from '../utils/directoryBackup.js';
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
    markDegraded: (reason) => this.markDegraded(reason),
    markReadyIfDegradedBy: (reason) => this.markReadyIfDegradedBy(reason)
  });

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (configManager) {
      this.enabled = configManager.getProperty('ngdpbase.comments.allow', true) as boolean;
      this.commentsDir = configManager.getResolvedDataPath(
        'ngdpbase.comments.storagedir',
        './data/comments'
      );
      // #1876: a staged site restore goes in before anything is read.
      const restored = applyDirectoryPartAtStart('CommentManager', this.commentsDir, configManager);
      if (restored?.refused) this.markDegraded(`A staged restore of the public pages' comments was not applied: ${restored.refused}`);
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
      await this.outsideCheck.run({ notify: true });
      logger.debug('CommentManager initialized');
    }
  }

  /**
   * The public folder is in the backup (#1876), as `<stem>.comments.tar` beside
   * the document: the public pages' comments. A vault page's are in its vault, which
   * PageManager backs up with the vault, sealed as stored.
   */
  override async backup(options?: ManagerBackupOptions): Promise<BackupData> {
    return backupDirectoryPart('CommentManager', 'comments', this.commentsDir, options);
  }

  /** Staged for the next start with the rest of a site restore (#1876); the live folder is untouched. */
  override async restore(backupData: BackupData, options?: ManagerRestoreOptions): Promise<void> {
    await super.restore(backupData);
    await stageDirectoryPart('CommentManager', this.commentsDir, backupData, options);
  }

  override restoreIsStaged(): boolean {
    return true;
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
    const comment: PageComment = {
      id,
      pageUuid,
      author: ctx.username,
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
      metadata: { ...who.metadata, pageUuid, commentId, author: comment.author, ownComment: comment.author === ctx.username }
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
