import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { PageComment } from '../types/Comment.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';

export default class CommentManager extends BaseManager {
  private commentsDir: string = './data/comments';
  private enabled: boolean = true;

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
      logger.debug('CommentManager initialized');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async getComments(pageUuid: string): Promise<PageComment[]> {
    const dir = path.join(this.commentsDir, pageUuid);
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const comments: PageComment[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
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
  async addComment(pageUuid: string, ctx: ActorContext, content: string): Promise<PageComment> {
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

    const dir = path.join(this.commentsDir, pageUuid);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(comment, null, 2), 'utf-8');
    this.invalidateHandlerCache(pageUuid);

    // At the door, after the write, on-failure: continue — the same footing as
    // page-edit. The content itself is never recorded; its length is.
    const who = actorOf(ctx);
    await recordAuditEvent(this.auditSink(), {
      eventType: AUDIT_EVENT.COMMENT_CREATE,
      user: who.user,
      ipAddress: who.ipAddress,
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
  async deleteComment(pageUuid: string, commentId: string, ctx: ActorContext): Promise<boolean> {
    const filePath = path.join(this.commentsDir, pageUuid, `${commentId}.json`);
    if (!fs.existsSync(filePath)) return false;

    const raw = fs.readFileSync(filePath, 'utf-8');
    const comment = JSON.parse(raw) as PageComment;
    comment.deleted = true;
    comment.deletedBy = ctx.username;
    comment.deletedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(comment, null, 2), 'utf-8');
    this.invalidateHandlerCache(pageUuid);

    const who = actorOf(ctx);
    await recordAuditEvent(this.auditSink(), {
      eventType: AUDIT_EVENT.COMMENT_DELETE,
      user: who.user,
      ipAddress: who.ipAddress,
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

  async getComment(pageUuid: string, commentId: string): Promise<PageComment | null> {
    const filePath = path.join(this.commentsDir, pageUuid, `${commentId}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PageComment;
    } catch {
      return null;
    }
  }

  async shutdown(): Promise<void> {}
}
