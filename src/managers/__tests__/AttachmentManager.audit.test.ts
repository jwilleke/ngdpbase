/**
 * Attachment records are written at the manager door (#1183).
 *
 * These moved here from `WikiRoutes.attachments.test.ts`, and the move is the
 * fix rather than a consequence of it. While the emit lived in the route, the
 * tests could only prove that *that route* recorded — and four other write
 * paths (NCM image localization, bulk import, thumbnail render, the media
 * browser's delete) produced no record at all. The last of those is
 * `asset-delete`, declared `tier: 'critical'` with note `'destruction'`.
 *
 * `docs/audit-posture.md` already states the rule these assert:
 *
 *   > A security-relevant action is declared in `auditRegistry.ts`, named in
 *   > `auditVocabulary.ts`, and emitted through `recordAuditEvent` (or the
 *   > manager door that calls it).
 *
 * Testing the door is what makes the property hold for every caller instead of
 * for the callers somebody remembered.
 */
import AttachmentManager from '../AttachmentManager';

interface Recorded { eventType: string; user: string; ipAddress?: string; metadata: Record<string, unknown> }

/** An engine whose AuditManager records into `sink`, and whose UserManager allows. */
function makeEngine(sink: Recorded[], opts: { auditFails?: boolean; noAudit?: boolean } = {}) {
  const logAuditEvent = opts.auditFails
    ? vi.fn().mockRejectedValue(new Error('audit disk full'))
    : vi.fn().mockImplementation((e: Recorded) => { sink.push(e); return Promise.resolve('id'); });
  return {
    getManager: (name: string) => {
      if (name === 'AuditManager') {
        return opts.noAudit ? null : { logAuditEvent, flushAuditQueue: () => Promise.resolve() };
      }
      if (name === 'UserManager') {
        return { hasPermission: () => Promise.resolve(true) };
      }
      return null;
    }
  } as never;
}

/** A manager with a stubbed provider, so only the audit behaviour is under test. */
function makeManager(engine: never, provider: Record<string, unknown>) {
  const m = new AttachmentManager(engine);
  (m as unknown as { attachmentProvider: unknown }).attachmentProvider = provider;
  return m;
}

const CTX = { username: 'testuser', isAuthenticated: true, roles: ['admin'] };
const WITH_IP = { request: { ip: '203.0.113.7' } };

describe('#1183 — asset-delete is recorded at the door', () => {
  test('records, naming the file that was destroyed', async () => {
    const sink: Recorded[] = [];
    const m = makeManager(makeEngine(sink), {
      deleteAttachment: () => Promise.resolve(true),
      getAttachmentMetadata: () => Promise.resolve({ filename: 'invoice.pdf', size: 4096 })
    });

    await m.deleteAttachment('att-1', CTX, WITH_IP);

    expect(sink).toHaveLength(1);
    expect(sink[0]).toMatchObject({
      eventType: 'asset-delete',
      user: 'testuser',
      metadata: { attachmentId: 'att-1', filename: 'invoice.pdf', sizeBytes: 4096 }
    });
  });

  test('the filename is read BEFORE the delete, not after', async () => {
    // Afterwards it is gone, and a record naming only an opaque id does not
    // answer "what was lost?". The ordering is the assertion.
    const order: string[] = [];
    const sink: Recorded[] = [];
    const m = makeManager(makeEngine(sink), {
      deleteAttachment: () => { order.push('delete'); return Promise.resolve(true); },
      getAttachmentMetadata: () => { order.push('read'); return Promise.resolve({ filename: 'x.pdf', size: 1 }); }
    });

    await m.deleteAttachment('att-1', CTX, WITH_IP);
    expect(order).toEqual(['read', 'delete']);
  });

  test('a failing audit backend REFUSES the delete rather than destroying unrecorded', async () => {
    // `critical` means the action must not complete when the record cannot be
    // written (#1158). Nothing is destroyed.
    const destroyed: string[] = [];
    const m = makeManager(makeEngine([], { auditFails: true }), {
      deleteAttachment: (id: string) => { destroyed.push(id); return Promise.resolve(true); },
      getAttachmentMetadata: () => Promise.resolve({ filename: 'invoice.pdf', size: 4096 })
    });

    await expect(m.deleteAttachment('att-1', CTX, WITH_IP)).rejects.toThrow();
    expect(destroyed).toEqual([]);
  });

  test('a metadata read failure degrades to the id, and does NOT block the delete', async () => {
    const sink: Recorded[] = [];
    const m = makeManager(makeEngine(sink), {
      deleteAttachment: () => Promise.resolve(true),
      getAttachmentMetadata: () => Promise.reject(new Error('gone'))
    });

    await expect(m.deleteAttachment('att-1', CTX, WITH_IP)).resolves.toBe(true);
    expect(sink[0].metadata).toMatchObject({ attachmentId: 'att-1', filename: 'att-1' });
    // `buildAttachmentAuditEvent` omits a non-numeric size rather than writing
    // `null` — an absent field reads as "not known", which is the truth here.
    expect('sizeBytes' in sink[0].metadata).toBe(false);
  });
});

describe('#1183 — asset-upload is recorded at the door', () => {
  const FILE = { originalName: 'photo.jpg', mimeType: 'image/jpeg', size: 2048 };

  function uploadManager(sink: Recorded[], opts: { auditFails?: boolean; noAudit?: boolean } = {}) {
    return makeManager(makeEngine(sink, opts), {
      storeAttachment: () => Promise.resolve({ identifier: 'att-9', name: 'photo.jpg' })
    });
  }

  test('records after the bytes are stored', async () => {
    const sink: Recorded[] = [];
    await uploadManager(sink).uploadAttachment(
      Buffer.from('x'), FILE, { pageName: 'Welcome', context: CTX, wikiContext: WITH_IP as never }
    );

    expect(sink).toHaveLength(1);
    expect(sink[0]).toMatchObject({
      eventType: 'asset-upload',
      user: 'testuser',
      metadata: { attachmentId: 'att-9', filename: 'photo.jpg', pageName: 'Welcome', sizeBytes: 2048 }
    });
  });

  test('the client IP comes from the WikiContext the caller carries', async () => {
    // The manager never sees the Express request. Moving the emit here would
    // otherwise have silently dropped the IP the route used to record.
    const sink: Recorded[] = [];
    await uploadManager(sink).uploadAttachment(
      Buffer.from('x'), FILE, { context: CTX, wikiContext: WITH_IP as never }
    );
    expect(sink[0].ipAddress).toBe('203.0.113.7');
  });

  test('an in-engine caller with no request records without an IP, rather than a fabricated one', async () => {
    const sink: Recorded[] = [];
    await uploadManager(sink).uploadAttachment(Buffer.from('x'), FILE, { context: CTX });
    expect(sink[0].ipAddress).toBeUndefined();
    expect(sink[0].user).toBe('testuser');
  });

  test('upload is `standard` tier: a failing audit backend does NOT fail the upload', async () => {
    // The inverse of delete, and deliberately so — losing the record must not
    // refuse a write that is not destruction.
    const m = uploadManager([], { auditFails: true });
    await expect(
      m.uploadAttachment(Buffer.from('x'), FILE, { context: CTX, wikiContext: WITH_IP as never })
    ).resolves.toMatchObject({ identifier: 'att-9' });
  });

  test('no AuditManager during early boot is a configuration state, not a failure', async () => {
    const m = uploadManager([], { noAudit: true });
    await expect(
      m.uploadAttachment(Buffer.from('x'), FILE, { context: CTX })
    ).resolves.toMatchObject({ identifier: 'att-9' });
  });
});

describe('#1183 — the delegation reaches the record', () => {
  test('viaToken from the caller context appears in the event', async () => {
    // A token-driven upload must be distinguishable from its owner acting
    // directly. Rebuilding the subject would drop this (P1).
    const sink: Recorded[] = [];
    const m = makeManager(makeEngine(sink), {
      storeAttachment: () => Promise.resolve({ identifier: 'att-9', name: 'photo.jpg' })
    });

    await m.uploadAttachment(
      Buffer.from('x'),
      { originalName: 'photo.jpg', mimeType: 'image/jpeg', size: 1 },
      {
        context: { ...CTX, viaToken: { id: 'tok-1', name: 'ingester', scopes: ['asset-upload'] } } as never,
        wikiContext: WITH_IP as never
      }
    );

    expect(sink[0].metadata).toMatchObject({ viaTokenId: 'tok-1' });
  });
});
