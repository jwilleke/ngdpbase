/**
 * #2041 (identity model step 6): a new audit row names the owner of the
 * resource it is about by the owner's identity `@id` in `metadata.owner`,
 * never the username. A name with no account is written as it is. Rows
 * already written are never rewritten (the view matches both, see
 * DatabaseAuditProvider.test.ts and AuditManager.test.ts).
 *
 * One test per emitter that sets `metadata.owner`. Sabotage check: putting the
 * username back at any emitter (e.g. `owner: invitation.username` in
 * AuthManager.auditInvitation) fails that emitter's test.
 */
vi.unmock('../providers/VersioningFileProvider');
import AuthManager from '../managers/AuthManager';
import OidcManager from '../managers/OidcManager';
import FileManager from '../managers/FileManager';
import VersioningFileProvider from '../providers/VersioningFileProvider';
import type { WikiEngine } from '../types/WikiEngine';
import { fakeIdentityManager } from '../test-support/identities';

const IDS: Record<string, string> = { jim: 'urn:uuid:11111111-1111-4111-8111-111111111111' };

function engineWithSink(opts: { down?: boolean } = {}): { engine: WikiEngine; rows: Array<Record<string, unknown>>; lookups: unknown[] } {
  const rows: Array<Record<string, unknown>> = [];
  const lookups: unknown[] = [];
  const identities = fakeIdentityManager(IDS, { ...opts, onLookup: (ctx) => lookups.push(ctx) });
  const audit = {
    logAuditEvent: vi.fn(async (e: Record<string, unknown>) => { rows.push(e); return 'id'; }),
    flushAuditQueue: vi.fn(async () => {})
  };
  const config = { getProperty: (_k: string, d: unknown) => d };
  const engine = {
    getManager: (name: string) => (name === 'AuditManager' ? audit : name === 'IdentityManager' ? identities : name === 'ConfigurationManager' ? config : null)
  } as unknown as WikiEngine;
  return { engine, rows, lookups };
}

const subject = { username: 'admin', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.9' };
const invitation = (username: string) => ({ id: 'inv-1', username, createdBy: 'admin', createdAt: '2026-10-26T00:00:00Z', expiresAt: '2026-10-27T00:00:00Z' });

describe('#2041 audit metadata.owner is the owner\'s identity @id', () => {
  test('an invitation row (sent, cancelled, used)', async () => {
    const { engine, rows, lookups } = engineWithSink();
    const auth = new AuthManager(engine) as unknown as {
      auditInvitation(e: string, ctx: unknown, inv: unknown): Promise<void>;
      recordInvitationUse(req: unknown, inv: unknown): Promise<void>;
    };
    await auth.auditInvitation('invitation-send', subject, invitation('jim'));
    await auth.recordInvitationUse({ ip: '203.0.113.1', get: () => 'ua' }, invitation('jim'));
    expect(rows.map((r) => (r.metadata as { owner: string }).owner)).toEqual([IDS.jim, IDS.jim]);
    // The username beside the @id, so the rows still list after the account is deleted.
    // Sabotage check: dropping `ownerUser: invitation.username` fails this.
    expect(rows.map((r) => (r.metadata as { ownerUser: string }).ownerUser)).toEqual(['jim', 'jim']);
    // The lookup is core's own, under the system context.
    expect(lookups[0]).toMatchObject({ origin: 'boot' });
    // `user` is still the account that acted, by username.
    expect(rows[1].user).toBe('jim');
  });

  test('a name with no account is written as it is, never guessed', async () => {
    const { engine, rows } = engineWithSink();
    const auth = new AuthManager(engine) as unknown as { auditInvitation(e: string, ctx: unknown, inv: unknown): Promise<void> };
    await auth.auditInvitation('invitation-send', subject, invitation('newcomer'));
    expect((rows[0].metadata as { owner: string }).owner).toBe('newcomer');
  });

  test('an app grant revoke', async () => {
    const { engine, rows } = engineWithSink();
    const oidc = new OidcManager(engine) as unknown as { writeEvent(e: unknown, revoker: unknown): Promise<void> };
    await oidc.writeEvent({ event: 'oidcgrant-revoke', accountId: 'jim', grantId: 'g1' }, subject);
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ owner: IDS.jim, ownerUser: 'jim' });
  });

  test('a sealed-store file upload', async () => {
    const { engine, rows } = engineWithSink();
    // #2149: the file record is FileManager's, the owner of files.
    const files = new FileManager(engine);
    await files.recordFileEvent('upload', subject, { attachmentId: 'a1', sealedStore: { owner: 'jim', store: 'health' } });
    expect(rows[0].metadata).toMatchObject({ owner: IDS.jim, ownerUser: 'jim', store: 'health', sealed: true });
  });

  test('a vault trash purge', async () => {
    const { engine, rows } = engineWithSink();
    const provider = new VersioningFileProvider(engine) as unknown as {
      recordPrivateRetentionPurge(ctx: unknown, purged: unknown[]): Promise<void>;
    };
    const job = { username: 'system', origin: 'schedule', requestedAt: '2026-10-26T00:00:00Z', reason: 'test' };
    await provider.recordPrivateRetentionPurge(job, [{ uuid: 'p1', creator: 'jim', store: 'default', deletedAt: '2026-09-01T00:00:00Z' }]);
    expect(rows[0].metadata).toMatchObject({ owner: IDS.jim, ownerUser: 'jim', store: 'default' });
  });

  test('the identity store down: the row is still written, the owner by username (#2041)', async () => {
    const { engine, rows } = engineWithSink({ down: true });
    const auth = new AuthManager(engine) as unknown as { auditInvitation(e: string, ctx: unknown, inv: unknown): Promise<void> };
    // Sabotage check: calling getByUserIdentifier (which throws) in place of identityIdOf rejects this.
    await auth.auditInvitation('invitation-send', subject, invitation('jim'));
    expect(rows[0].metadata).toMatchObject({ owner: 'jim', ownerUser: 'jim' });
  });
});
