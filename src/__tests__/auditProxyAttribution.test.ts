/**
 * #1762 slice 3 — an audit row done under a proxy grant names both people.
 *
 * Operator decision: `user` is the person represented (the account acted on),
 * and a separate top-level `actor` names who actually did it, filterable in
 * the audit search. A row with no proxy claim has NO `actor` field — absent,
 * never a copy of `user` — so every existing row is unchanged.
 *
 * Nothing reaches a proxy subject until slice 4; these build the subject the
 * session middleware will build then.
 */
vi.unmock('../providers/BaseAuditProvider');
vi.unmock('../providers/FileAuditProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { actorOf } from '../context/ActorContext';
import { attributedTo } from '../context/bootActions';
import { jobContextFromRequest } from '../context/JobContext';
import { buildAttachmentAuditEvent, buildPageMutationAuditEvent, buildPageViewAuditEvent } from '../utils/auditEvents';
import { redactPrivateNamesDeep } from '../utils/redactPrivateNames';
import PolicyInformationPoint from '../security/PolicyInformationPoint';
import PolicyDecisionPoint from '../security/PolicyDecisionPoint';
import FileAuditProvider from '../providers/FileAuditProvider';
import type { ProxyClaim } from '../managers/UserManager';

const IP = '203.0.113.9';
const claim: ProxyClaim = { kind: 'proxy', grantId: 'pg-1', actor: 'jim', scopes: ['page-read', 'page-edit', 'asset-read'] };
/** Mom's account, acted on by Jim under grant pg-1. */
const momViaJim = { username: 'mom', roles: ['Authenticated', 'All'], isAuthenticated: true, ipAddress: IP, viaProxy: claim };
const mom = { username: 'mom', roles: ['Authenticated', 'All'], isAuthenticated: true, ipAddress: IP };

describe('#1762 slice 3: the one place a row\'s "who" comes from', () => {
  test('actorOf a proxy subject: user = represented, actor = proxy, grant in metadata', () => {
    expect(actorOf(momViaJim)).toEqual({
      user: 'mom', actor: 'jim', ipAddress: IP,
      metadata: { origin: 'request', delegated: 'proxy', proxyGrantId: 'pg-1' }
    });
  });

  test('actorOf a plain subject has no actor field at all', () => {
    const who = actorOf(mom);
    expect(who).not.toHaveProperty('actor');
    expect(who).toEqual({ user: 'mom', ipAddress: IP, metadata: { origin: 'request' } });
  });

  test('a job queued under a proxy grant keeps the actor (attributedTo)', () => {
    const who = attributedTo(jobContextFromRequest(momViaJim));
    expect(who).toMatchObject({ user: 'mom', actor: 'jim', metadata: { origin: 'request', proxyGrantId: 'pg-1' } });
    expect(attributedTo(jobContextFromRequest(mom))).not.toHaveProperty('actor');
  });
});

describe('#1762 slice 3: content rows', () => {
  test('a page edit under a proxy grant carries both people', () => {
    const row = buildPageMutationAuditEvent({ op: 'edit', username: 'mom', ipAddress: IP, pageName: 'Recipes', uuid: 'u1', viaProxy: claim });
    expect(row).toMatchObject({ eventType: 'page-edit', user: 'mom', actor: 'jim', metadata: { proxyGrantId: 'pg-1', delegated: 'proxy' } });
  });

  test('a page edit with no proxy is unchanged: no actor, no proxy metadata', () => {
    const row = buildPageMutationAuditEvent({ op: 'edit', username: 'mom', ipAddress: IP, pageName: 'Recipes', uuid: 'u1' });
    expect(row).not.toHaveProperty('actor');
    expect(row.metadata).toEqual({ pageName: 'Recipes', uuid: 'u1', viaTokenId: null, viaTokenName: null });
  });

  test('page view and attachment rows carry the actor too', () => {
    expect(buildPageViewAuditEvent({ username: 'mom', ipAddress: IP, pageName: 'P', uuid: null, viaProxy: claim }))
      .toMatchObject({ user: 'mom', actor: 'jim' });
    expect(buildAttachmentAuditEvent({ op: 'upload', username: 'mom', ipAddress: IP, attachmentId: 'a1', filename: 'f.png', viaProxy: claim }))
      .toMatchObject({ user: 'mom', actor: 'jim' });
  });

  test('redaction still applies to a proxy row, and leaves both names', () => {
    const row = redactPrivateNamesDeep(buildPageMutationAuditEvent({
      op: 'edit', username: 'mom', ipAddress: IP, pageName: 'vaults/mom/default/Diary', uuid: 'u1', viaProxy: claim
    }));
    expect(row.metadata.pageName).toBe('vaults/mom/default/[redacted]');
    expect(row).toMatchObject({ user: 'mom', actor: 'jim' });
  });
});

describe('#1762 slice 3: denials (PolicyInformationPoint.auditDenial)', () => {
  let records: Array<Record<string, unknown>> = [];
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  function makePip(): PolicyInformationPoint {
    const engine = {
      getManager: (name: string): unknown => {
        if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d, isInitialized: () => true };
        if (name === 'PolicyEvaluator') {
          return { evaluateAccess: async ({ action }: { action: string }) => (action === 'page-read' ? { hasDecision: true, allowed: true } : { hasDecision: false, allowed: false, reason: 'no_match' }) };
        }
        if (name === 'PolicyDecisionPoint') return pdp;
        if (name === 'AuditManager') return { logAuditEvent: async (e: Record<string, unknown>) => { records.push(e); return 'evt'; } };
        // No AuthManager: the grant cannot be re-read, so the proxy ceiling refuses.
        return null;
      }
    };
    const pdp = new PolicyDecisionPoint(engine);
    return new PolicyInformationPoint(engine);
  }

  beforeEach(() => { records = []; });

  test('a refused page edit under a proxy grant names both people', async () => {
    const pip = makePip();
    await pip.initialize();
    const ctx = { pageName: 'Recipes', content: 'x', context: 'edit', userContext: momViaJim, pageMetadata: { title: 'Recipes' } } as never;
    expect(await pip.checkPagePermissionWithContext(ctx, 'edit')).toBe(false);
    await settle();
    expect(records[0]).toMatchObject({ eventType: 'authorization-deny', user: 'mom', actor: 'jim', ipAddress: IP, metadata: { proxyGrantId: 'pg-1' } });
  });

  test('a refused media read under a proxy grant names both people', async () => {
    const pip = makePip();
    await pip.initialize();
    expect(await pip.canUserAccessMediaItem(momViaJim as never, { id: 'm1', metadata: {} })).toBe(false);
    await settle();
    expect(records[0]).toMatchObject({ eventType: 'authorization-deny', resourceType: 'media', user: 'mom', actor: 'jim' });
  });

  test('a plain denial is unchanged: no actor field', async () => {
    const pip = makePip();
    await pip.initialize();
    const ctx = { pageName: 'Recipes', content: 'x', context: 'edit', userContext: mom, pageMetadata: { title: 'Recipes' } } as never;
    expect(await pip.checkPagePermissionWithContext(ctx, 'edit')).toBe(false);
    await settle();
    expect(records[0]).toMatchObject({ user: 'mom', metadata: {} });
    expect(records[0]).not.toHaveProperty('actor');
  });
});

describe('#1762 slice 3: the file provider stores actor and filters on it', () => {
  let dir: string;
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-actor-')); });
  // Only the temp directory this test created. Never a data directory.
  afterEach(async () => { await fs.remove(dir); });

  test('?actor= returns the rows the proxy did, and a plain row stores no actor', async () => {
    const engine = {
      getManager: (name: string) => (name === 'ConfigurationManager'
        ? { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.audit.provider.file.logdirectory' ? dir : d), getResolvedDataPath: () => dir }
        : null)
    } as never;
    const provider = new FileAuditProvider(engine);
    await provider.initialize();
    await provider.logAuditEvent(buildPageMutationAuditEvent({ op: 'edit', username: 'mom', ipAddress: IP, pageName: 'A', uuid: 'a', viaProxy: claim }) as never);
    await provider.logAuditEvent(buildPageMutationAuditEvent({ op: 'edit', username: 'mom', ipAddress: IP, pageName: 'B', uuid: 'b' }) as never);
    // Search reads what has been flushed.
    await provider.flush();

    const byJim = await provider.searchAuditLogs({ actor: 'jim' });
    expect(byJim.results.map((r) => (r as unknown as { metadata: { pageName: string } }).metadata.pageName)).toEqual(['A']);
    const forMom = await provider.searchAuditLogs({ user: 'mom' });
    expect(forMom.total).toBe(2);
    const plain = forMom.results.find((r) => (r as unknown as { metadata: { pageName: string } }).metadata.pageName === 'B');
    expect(plain).not.toHaveProperty('actor');
    await provider.close();
  });
});
