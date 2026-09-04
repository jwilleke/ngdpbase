/**
 * #1121 gap C — page writes are audited at the DOOR, not by the caller.
 *
 * This moved out of WikiRoutes for a concrete reason. When each route emitted
 * its own audit event, four of the eight route paths that save a page simply
 * forgot: createPageFromTemplate, appendAttachDirective, captureSubmit and
 * ingestPageMarkdown all wrote pages that appeared in no audit log at all. The
 * last of those is the MCP write path, so an agent could create pages and leave
 * no trace — precisely the attribution the audit trail exists to provide.
 *
 * So these tests are about the invariant rather than the formatting: reaching
 * the provider means a record was emitted. The op is derived from state the
 * manager already computes, so a caller cannot classify its own write wrongly
 * either.
 */
vi.unmock('../PageManager');

import PageManager from '../PageManager';

type StoredPage = { title: string; content: string; metadata: Record<string, unknown> };

function makeManager(existing: StoredPage[] = []) {
  const byTitle = new Map(existing.map(p => [p.title, p]));
  const events: Array<Record<string, unknown>> = [];

  const provider = {
    getPage: vi.fn(async (title: string) => byTitle.get(title) ?? null),
    getPageMetadata: vi.fn(async (title: string) => byTitle.get(title)?.metadata ?? null),
    savePage: vi.fn(async () => {}),
    movePrivatePage: vi.fn(async () => {})
  };

  const auditManager = {
    logAuditEvent: vi.fn(async (event: Record<string, unknown>) => {
      events.push(event);
      return 'id';
    })
  };

  const manager = new PageManager({
    getManager: vi.fn((name: string) => (name === 'AuditManager' ? auditManager : null))
  }) as unknown as {
    provider: unknown;
    savePageWithContext: (ctx: unknown, meta?: unknown, opts?: unknown) => Promise<void>;
  };
  manager.provider = provider;

  return { manager, provider, events };
}

function context(pageName: string, content = 'body', username: string | undefined = 'jim') {
  return {
    pageName,
    content,
    userContext: username ? { username } : null
  };
}

/** The emission is deliberately not awaited by the save path. */
const settle = () => new Promise(resolve => setImmediate(resolve));

describe('PageManager.savePageWithContext() audit emission (#1121)', () => {
  test('a new page emits page-create', async () => {
    const { manager, events } = makeManager();
    await manager.savePageWithContext(context('Brand New'), { title: 'Brand New' });
    await settle();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'page-create', user: 'jim' });
  });

  test('an existing page emits page-edit', async () => {
    const { manager, events } = makeManager([
      { title: 'Existing', content: 'old', metadata: { title: 'Existing', author: 'jim' } }
    ]);
    await manager.savePageWithContext(context('Existing'), { title: 'Existing' });
    await settle();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'page-edit' });
  });

  test('a changed title emits page-rename naming both titles', async () => {
    const { manager, events } = makeManager([
      { title: 'Old Name', content: 'old', metadata: { title: 'Old Name', author: 'jim' } }
    ]);
    await manager.savePageWithContext(context('Old Name'), { title: 'New Name' });
    await settle();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'page-rename',
      metadata: expect.objectContaining({ pageName: 'New Name', fromPageName: 'Old Name' })
    });
  });

  test('the rename derivation does not depend on the caller declaring it', async () => {
    // The route used to classify its own write. Both rename paths now get the
    // same answer from the same place, without either of them saying so.
    const { manager, events } = makeManager([
      { title: 'Old Name', content: 'old', metadata: { title: 'Old Name', author: 'jim' } }
    ]);
    await manager.savePageWithContext(context('Old Name'), { title: 'New Name' }, {});
    await settle();
    expect(events[0]).toMatchObject({ eventType: 'page-rename' });
  });

  test('a caller may declare link-rewrite, which the manager cannot infer', async () => {
    // From inside PageManager this is an ordinary edit: the page's own title
    // did not change, its links did.
    const { manager, events } = makeManager([
      { title: 'Alpha', content: '[Old]', metadata: { title: 'Alpha', author: 'jim' } }
    ]);
    await manager.savePageWithContext(context('Alpha', '[New]'), { title: 'Alpha' }, {
      audit: { op: 'link-rewrite', rewriteOf: { from: 'Old', to: 'New' } }
    });
    await settle();

    expect(events[0]).toMatchObject({
      eventType: 'page-link-rewrite',
      metadata: expect.objectContaining({ rewriteFrom: 'Old', rewriteTo: 'New' })
    });
  });

  test('carries the client IP when the caller supplies one', async () => {
    const { manager, events } = makeManager();
    await manager.savePageWithContext(context('Ip Page'), { title: 'Ip Page' }, {
      audit: { ipAddress: '10.0.0.7' }
    });
    await settle();
    expect(events[0]).toMatchObject({ ipAddress: '10.0.0.7' });
  });

  test('a caller that supplies nothing is still audited', async () => {
    // The whole point of the move. Four route paths forgot; forgetting is no
    // longer possible.
    const { manager, events } = makeManager();
    await manager.savePageWithContext(context('Forgetful'), { title: 'Forgetful' });
    await settle();
    expect(events).toHaveLength(1);
  });

  test('an agent write carries the token, so the page traces to the agent', async () => {
    const { manager, events } = makeManager();
    const ctx = {
      pageName: 'Agent Page',
      content: 'body',
      userContext: { username: 'jim', viaToken: { id: 'tok_1', name: 'ingest-bot' } }
    };
    await manager.savePageWithContext(ctx, { title: 'Agent Page' });
    await settle();

    expect(events[0]).toMatchObject({
      metadata: expect.objectContaining({ viaTokenName: 'ingest-bot' })
    });
  });

  test('a failing audit sink does not fail the save', async () => {
    // page.* is NOT declared critical in the audit registry: a page edit that
    // is already on disk must not be reported to the user as failed. The
    // refuse-on-failure rule — where the action refuses rather than proceed unrecorded —
    // is deletes and token mint/revoke.
    const { provider } = makeManager();
    const broken = new PageManager({
      getManager: vi.fn((name: string) =>
        name === 'AuditManager'
          ? { logAuditEvent: vi.fn(async () => { throw new Error('audit down'); }) }
          : null
      )
    }) as unknown as { provider: unknown; savePageWithContext: (c: unknown, m?: unknown) => Promise<void> };
    broken.provider = provider;

    await expect(broken.savePageWithContext(context('Still Saves'), { title: 'Still Saves' }))
      .resolves.toBeUndefined();
    await settle();
    expect(provider.savePage).toHaveBeenCalled();
  });

  test('audit.skip suppresses the record', async () => {
    const { manager, events } = makeManager();
    await manager.savePageWithContext(context('Quiet'), { title: 'Quiet' }, {
      audit: { skip: true }
    });
    await settle();
    expect(events).toHaveLength(0);
  });
});
