import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPageMutationAuditEvent,
  buildAttachmentAuditEvent,
  buildTokenAuditEvent,
  recordAuditEvent,
  getAuditDropStats,
  resetAuditDropStats,
  type AuditEventSink
} from '../auditEvents.js';

/**
 * #1080 — page create/edit/rename and attachment upload/delete produced no
 * audit events at all. Only page.delete, admin raw-edit, sessions, and shares
 * were logged, so "who changed this page, when, and through what?" was only
 * answerable from a version manifest — per-page, and only under the
 * versioning provider.
 *
 * These tests pin the event shape rather than the wiring, because the shape
 * is the contract: an agent-token write must be distinguishable from a human
 * one, which is the whole reason for logging these at all now that tokens
 * (#946) can write unattended.
 */
describe('buildPageMutationAuditEvent', () => {
  const base = {
    username: 'alice',
    ipAddress: '10.0.0.1',
    pageName: 'Welcome',
    uuid: 'uuid-1'
  };

  it('builds a page.create event', () => {
    const event = buildPageMutationAuditEvent({ ...base, op: 'create' });
    expect(event.eventType).toBe('page.create');
    expect(event.action).toBe('page-create');
    expect(event.user).toBe('alice');
    expect(event.ipAddress).toBe('10.0.0.1');
    expect(event.result).toBe('success');
    expect(event.metadata.pageName).toBe('Welcome');
    expect(event.metadata.uuid).toBe('uuid-1');
  });

  it('builds a page.edit event', () => {
    const event = buildPageMutationAuditEvent({ ...base, op: 'edit' });
    expect(event.eventType).toBe('page.edit');
    expect(event.action).toBe('page-edit');
  });

  it('builds a page.rename event carrying both titles', () => {
    // #1082 reads exactly these two fields to resolve a link that points at a
    // page's former title, so they are load-bearing rather than descriptive.
    const event = buildPageMutationAuditEvent({
      ...base,
      op: 'rename',
      pageName: 'New Title',
      fromPageName: 'Old Title'
    });
    expect(event.eventType).toBe('page.rename');
    expect(event.action).toBe('page-rename');
    expect(event.metadata.fromPageName).toBe('Old Title');
    expect(event.metadata.pageName).toBe('New Title');
  });

  it('omits fromPageName for non-rename operations rather than sending null noise', () => {
    const event = buildPageMutationAuditEvent({ ...base, op: 'edit' });
    expect('fromPageName' in event.metadata).toBe(false);
  });

  it('records the agent token and raises severity when the write came from one', () => {
    const event = buildPageMutationAuditEvent({
      ...base,
      op: 'edit',
      viaToken: { id: 'tok-9', name: 'ci-bot' }
    });
    expect(event.metadata.viaTokenId).toBe('tok-9');
    expect(event.metadata.viaTokenName).toBe('ci-bot');
    expect(event.severity).toBe('medium');
  });

  it('uses low severity for an ordinary human edit', () => {
    const event = buildPageMutationAuditEvent({ ...base, op: 'edit' });
    expect(event.severity).toBe('low');
    expect(event.metadata.viaTokenId).toBeNull();
    expect(event.metadata.viaTokenName).toBeNull();
  });

  it('falls back to "unknown" rather than dropping the event when there is no username', () => {
    const event = buildPageMutationAuditEvent({ ...base, username: undefined, op: 'create' });
    expect(event.user).toBe('unknown');
  });
});

describe('buildAttachmentAuditEvent', () => {
  const base = {
    username: 'bob',
    ipAddress: '10.0.0.2',
    attachmentId: 'att-1',
    filename: 'photo.jpg'
  };

  it('builds an attachment.upload event', () => {
    const event = buildAttachmentAuditEvent({ ...base, op: 'upload', pageName: 'Trip', sizeBytes: 2048 });
    expect(event.eventType).toBe('attachment.upload');
    expect(event.action).toBe('attachment-upload');
    expect(event.metadata.attachmentId).toBe('att-1');
    expect(event.metadata.filename).toBe('photo.jpg');
    expect(event.metadata.pageName).toBe('Trip');
    expect(event.metadata.sizeBytes).toBe(2048);
  });

  it('builds an attachment.delete event', () => {
    const event = buildAttachmentAuditEvent({ ...base, op: 'delete' });
    expect(event.eventType).toBe('attachment.delete');
    expect(event.action).toBe('attachment-delete');
  });

  it('rates a delete more severe than an upload — a delete is the one that loses data', () => {
    const upload = buildAttachmentAuditEvent({ ...base, op: 'upload' });
    const remove = buildAttachmentAuditEvent({ ...base, op: 'delete' });
    expect(upload.severity).toBe('low');
    expect(remove.severity).toBe('medium');
  });

  it('raises a token-driven delete to high, matching page.delete', () => {
    const event = buildAttachmentAuditEvent({
      ...base,
      op: 'delete',
      viaToken: { id: 'tok-1', name: 'bot' }
    });
    expect(event.severity).toBe('high');
    expect(event.metadata.viaTokenId).toBe('tok-1');
  });

  it('omits optional page and size when not supplied', () => {
    const event = buildAttachmentAuditEvent({ ...base, op: 'delete' });
    expect('pageName' in event.metadata).toBe(false);
    expect('sizeBytes' in event.metadata).toBe(false);
  });
});

describe('recordAuditEvent', () => {
  let sink: AuditEventSink & { logAuditEvent: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    sink = { logAuditEvent: vi.fn().mockResolvedValue('id') };
  });

  it('forwards the event to the sink', async () => {
    const event = buildPageMutationAuditEvent({
      username: 'alice', ipAddress: '1.1.1.1', pageName: 'P', uuid: 'u', op: 'create'
    });
    await recordAuditEvent(sink, event);
    expect(sink.logAuditEvent).toHaveBeenCalledWith(event);
  });

  it('swallows a sink rejection — auditing must never fail the mutation it describes', async () => {
    // The write has already happened by the time this runs. Throwing here
    // would turn a committed save into a 500 and invite a destructive retry.
    sink.logAuditEvent.mockRejectedValue(new Error('disk full'));
    const event = buildPageMutationAuditEvent({
      username: 'alice', ipAddress: '1.1.1.1', pageName: 'P', uuid: 'u', op: 'edit'
    });
    await expect(recordAuditEvent(sink, event)).resolves.toBeUndefined();
  });

  it('is a no-op when no audit manager is configured', async () => {
    await expect(recordAuditEvent(null, buildPageMutationAuditEvent({
      username: 'a', ipAddress: '1', pageName: 'P', uuid: 'u', op: 'edit'
    }))).resolves.toBeUndefined();
  });

  it('is a no-op when the manager exposes no logAuditEvent', async () => {
    await expect(recordAuditEvent({}, buildPageMutationAuditEvent({
      username: 'a', ipAddress: '1', pageName: 'P', uuid: 'u', op: 'edit'
    }))).resolves.toBeUndefined();
  });
});

/**
 * #1111 — agent token lifecycle events.
 *
 * The credential store was the only record that a token ever existed:
 * `AgentTokenManager` emitted nothing, while `purgeExpired()`'s comment claimed
 * "Audit is unaffected". There was no audit to be unaffected, which made
 * `retention-days: 30` load-bearing by accident — hash-bearing records kept a
 * month past usefulness to serve as an audit log they were never designed to be.
 */
describe('buildTokenAuditEvent() — #1111', () => {
  const base = { username: 'alice', ipAddress: '10.0.0.1', id: 'tok_1', owner: 'alice' };

  it('a mint carries what the token can do and until when', () => {
    const e = buildTokenAuditEvent({
      ...base, op: 'mint', scopes: ['page-read', 'page-edit'], expiresAt: '2026-09-01T00:00:00.000Z', name: 'ci'
    });
    expect(e.eventType).toBe('token.mint');
    expect(e.action).toBe('token-mint');
    expect(e.result).toBe('success');
    expect(e.metadata).toMatchObject({
      id: 'tok_1', owner: 'alice', name: 'ci',
      scopes: ['page-read', 'page-edit'], expiresAt: '2026-09-01T00:00:00.000Z'
    });
  });

  it('a revoke records who did it, which is the question afterwards', () => {
    const e = buildTokenAuditEvent({ ...base, op: 'revoke', username: 'admin', revokedBy: 'admin' });
    expect(e.eventType).toBe('token.revoke');
    expect(e.metadata).toMatchObject({ id: 'tok_1', owner: 'alice', revokedBy: 'admin' });
  });

  it('scopes are absent from a revoke rather than emitted empty', () => {
    // Same rule the page builders follow: a field present on every event is
    // useless as a filter.
    const e = buildTokenAuditEvent({ ...base, op: 'revoke', revokedBy: 'alice' });
    expect(e.metadata).not.toHaveProperty('scopes');
    expect(e.metadata).not.toHaveProperty('expiresAt');
  });

  it('minting a credential outranks ordinary content traffic', () => {
    // A token writes unattended, so its creation is worth surfacing above an
    // edit even when a human did it.
    expect(buildTokenAuditEvent({ ...base, op: 'mint', scopes: [], expiresAt: 'x' }).severity).toBe('medium');
  });

  it('a token minted BY a token is the case to surface loudest', () => {
    const e = buildTokenAuditEvent({
      ...base, op: 'mint', scopes: [], expiresAt: 'x', viaToken: { id: 't0', name: 'ci' }
    });
    expect(e.severity).toBe('high');
    expect(e.metadata).toMatchObject({ viaTokenId: 't0', viaTokenName: 'ci' });
  });

  it('token identity is always present, as explicit nulls for a human action', () => {
    const e = buildTokenAuditEvent({ ...base, op: 'revoke', revokedBy: 'alice' });
    expect(e.metadata).toMatchObject({ viaTokenId: null, viaTokenName: null });
  });

  it('an unknown actor is named rather than left undefined', () => {
    const e = buildTokenAuditEvent({ ...base, username: undefined, op: 'revoke', revokedBy: 'system' });
    expect(e.user).toBe('unknown');
  });
});

/**
 * #1109 option 5 — an accepted failure must be observable.
 *
 * Every audit write in this codebase is fire-and-forget with a caught error:
 * losing the log is bad, but refusing a page save or a token mint because the
 * log failed is worse. That is a deliberate choice, and it means a request can
 * land its write and lose its audit entry — a page edited with no history, or
 * a credential minted with no record it exists.
 *
 * The choice is defensible. What is not is that the only trace was a
 * logger.warn nobody reads. An accepted risk nobody can see is
 * indistinguishable from an unnoticed bug.
 */
describe('dropped audit events are counted — #1109', () => {
  beforeEach(() => resetAuditDropStats());

  // A STANDARD event: these cover drop counting, not tiering. Using a critical
  // one would exercise #1121's durability guard instead of what is under test.
  const event = () => buildPageMutationAuditEvent({
    op: 'edit', username: 'alice', ipAddress: undefined, pageName: 'P', uuid: null
  });

  it('starts at zero', () => {
    expect(getAuditDropStats().dropped).toBe(0);
  });

  it('a successful write counts nothing', async () => {
    await recordAuditEvent({ logAuditEvent: async () => 'id' }, event());
    expect(getAuditDropStats().dropped).toBe(0);
  });

  it('a failed write is counted', async () => {
    const sink: AuditEventSink = { logAuditEvent: async () => { throw new Error('sink down'); } };
    await recordAuditEvent(sink, event());
    await recordAuditEvent(sink, event());
    expect(getAuditDropStats().dropped).toBe(2);
  });

  it('records what was lost and when, not just how many', async () => {
    await recordAuditEvent({ logAuditEvent: async () => { throw new Error('ENOSPC'); } }, event());
    const stats = getAuditDropStats();
    expect(stats.lastEventType).toBe('page.edit');
    expect(stats.lastError).toMatch(/ENOSPC/);
    expect(stats.lastAt).toBeTruthy();
  });

  it('an absent sink is not a drop', async () => {
    // No AuditManager registered is a configuration state, not a failure.
    // Counting it would make the number meaningless on any instance that
    // never enabled auditing.
    await recordAuditEvent(null, event());
    await recordAuditEvent({}, event());
    expect(getAuditDropStats().dropped).toBe(0);
  });

  it('still calls the caller onError, so existing handling is unchanged', async () => {
    const onError = vi.fn();
    await recordAuditEvent({ logAuditEvent: async () => { throw new Error('x'); } }, event(), onError);
    expect(onError).toHaveBeenCalledOnce();
  });
});

/**
 * #1121 gap D — not every event needs the same guarantee.
 *
 * The #1109 decision was fire-and-forget for everything: losing the log is bad,
 * refusing a page save because the log failed is worse. That is right for
 * page.view and wrong for token.mint, where the record IS the only evidence the
 * credential exists.
 *
 * The tier lives in the #1120 registry, so "which events must be durable" is
 * data rather than a judgement remade at each call site.
 */
describe('#1121 tiered durability', () => {
  const critical = () => buildTokenAuditEvent({
    op: 'mint', username: 'alice', ipAddress: undefined, id: 'tok_1', owner: 'alice', scopes: [], expiresAt: 'x'
  });
  const standard = () => buildPageMutationAuditEvent({
    op: 'edit', username: 'alice', ipAddress: undefined, pageName: 'P', uuid: null
  });

  it('a standard event survives a failing sink, as before', async () => {
    const onError = vi.fn();
    await expect(recordAuditEvent(
      { logAuditEvent: async () => { throw new Error('sink down'); } },
      standard(),
      onError
    )).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('a critical event REJECTS when the sink fails', async () => {
    // The caller must be able to abandon the action. A credential minted with
    // no record of it existing is the case this exists for.
    await expect(recordAuditEvent(
      { logAuditEvent: async () => { throw new Error('sink down'); } },
      critical()
    )).rejects.toThrow(/audit/i);
  });

  it('a critical event is flushed, not merely queued', async () => {
    // "Durable before the action completes" is not satisfied by a queue that
    // flushes on a timer — the process can die in between.
    const flush = vi.fn(async () => {});
    await recordAuditEvent({ logAuditEvent: async () => 'id', flushAuditQueue: flush }, critical());
    expect(flush).toHaveBeenCalledOnce();
  });

  it('a standard event is not flushed, so the common path keeps its batching', async () => {
    const flush = vi.fn(async () => {});
    await recordAuditEvent({ logAuditEvent: async () => 'id', flushAuditQueue: flush }, standard());
    expect(flush).not.toHaveBeenCalled();
  });

  it('a critical event rejects when the FLUSH fails, not just the write', async () => {
    await expect(recordAuditEvent(
      { logAuditEvent: async () => 'id', flushAuditQueue: async () => { throw new Error('disk full'); } },
      critical()
    )).rejects.toThrow(/audit/i);
  });

  it('a critical event on a sink that cannot flush still rejects rather than pretending', async () => {
    // A provider with no flush cannot promise durability. Silently accepting
    // would report a guarantee the system does not have.
    await expect(recordAuditEvent({ logAuditEvent: async () => 'id' }, critical()))
      .rejects.toThrow(/durab/i);
  });

  it('an absent sink does not fail a critical action', async () => {
    // Auditing switched off is a configuration decision, already visible via
    // #1118's posture. It must not turn every mint into an error.
    await expect(recordAuditEvent(null, critical())).resolves.toBeUndefined();
  });

  it('counts a critical loss too', async () => {
    resetAuditDropStats();
    // Needs a flush, or the durability guard refuses before any write is
    // attempted and there is nothing to count.
    await recordAuditEvent(
      { logAuditEvent: async () => { throw new Error('x'); }, flushAuditQueue: async () => {} },
      critical()
    ).catch(() => {});
    expect(getAuditDropStats().dropped).toBe(1);
  });
});
