import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPageMutationAuditEvent,
  buildAttachmentAuditEvent,
  recordAuditEvent,
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
