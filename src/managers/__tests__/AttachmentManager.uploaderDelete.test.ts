/**
 * #2534: the person who uploaded a shared file may delete it, without holding
 * `asset-delete`. The rule lives at the manager door, so the Delete button on
 * /search, the existing DELETE /attachments/:id route and any other caller get
 * the same answer.
 *
 * What these pin, one per way it could go wrong:
 *   - the uploader is allowed, and the audit entry names them (written first);
 *   - nobody else is: another person, a file with no recorded uploader, an
 *     orphaned uploader, a different file than the one the uploader owns;
 *   - the exception needs a real signed-in person: not anonymous, not an
 *     asserted username, not a job, not a token, share or proxy request;
 *   - an explicit deny policy still wins, and a policy engine that cannot
 *     answer fails closed;
 *   - an unreadable record or identity store denies rather than guesses;
 *   - the button's answer (`mayDeleteAttachment`) is the door's answer.
 */
import AttachmentManager from '../AttachmentManager';
import { withFilesDoor } from '../../test-support/filesDoor';
import { fakeIdentityManager } from '../../test-support/identities';
import { jobContextFromRequest, jobContextFromOperator } from '../../context/JobContext';
import type { ActorContext } from '../../context/ActorContext';

const JIM = 'urn:uuid:11111111-1111-4111-8111-111111111111';
const BOB = 'urn:uuid:22222222-2222-4222-8222-222222222222';

type AssetDelete = 'silent' | 'deny' | 'permit' | 'no_evaluator';

interface Recorded { eventType: string; user: string; actor?: string; metadata: Record<string, unknown> }

interface Setup {
  /** What each file's record says about its uploader; a missing key is a file that does not exist. */
  files: Record<string, string>;
  assetDelete?: AssetDelete;
  identities?: unknown;
  auditFails?: boolean;
  metadataFails?: boolean;
}

function make(setup: Setup) {
  const sink: Recorded[] = [];
  const order: string[] = [];
  const destroyed: string[] = [];
  const decisionFor = (): { permit: boolean; applicable: boolean; reason: string; policyIds: string[] } => {
    switch (setup.assetDelete ?? 'silent') {
    case 'permit': return { permit: true, applicable: true, reason: 'policy_allow', policyIds: ['p'] };
    case 'deny': return { permit: false, applicable: true, reason: 'policy_deny', policyIds: ['p'] };
    case 'no_evaluator': return { permit: false, applicable: false, reason: 'no_evaluator', policyIds: [] };
    default: return { permit: false, applicable: false, reason: 'No matching policy', policyIds: [] };
    }
  };
  const engine = {
    getManager: (name: string) => {
      if (name === 'PolicyDecisionPoint') {
        return {
          permits: () => Promise.resolve(decisionFor().permit),
          holds: () => Promise.resolve(decisionFor().permit),
          decide: () => Promise.resolve(decisionFor())
        };
      }
      if (name === 'AuditManager') {
        return {
          logAuditEvent: setup.auditFails
            ? vi.fn().mockRejectedValue(new Error('audit disk full'))
            : vi.fn().mockImplementation((e: Recorded) => { order.push('audit'); sink.push(e); return Promise.resolve('id'); }),
          flushAuditQueue: () => Promise.resolve()
        };
      }
      if (name === 'IdentityManager') return setup.identities ?? null;
      return null;
    }
  } as never;
  const m = withFilesDoor(new AttachmentManager(engine));
  (m as unknown as { attachmentProvider: unknown }).attachmentProvider = {
    getAttachmentMetadata: (id: string) => {
      if (setup.metadataFails) return Promise.reject(new Error('metadata unreadable'));
      return id in setup.files
        ? Promise.resolve({ identifier: id, filename: `${id}.pdf`, size: 10, uploadedBy: setup.files[id] })
        : Promise.resolve(null);
    },
    deleteAttachment: (id: string) => { order.push('destroy'); destroyed.push(id); return Promise.resolve(true); }
  };
  return { m, sink, order, destroyed };
}

const person = (username: string, extra: Record<string, unknown> = {}) =>
  ({ username, isAuthenticated: true, roles: ['reader'], ...extra }) as unknown as ActorContext;
const identities = () => fakeIdentityManager({ jim: JIM, bob: BOB });

describe('#2534 the uploader may delete their own shared file', () => {
  test('allowed without asset-delete, recorded with who deleted it, and the record comes first', async () => {
    const { m, sink, order, destroyed } = make({ files: { 'att-1': JIM }, identities: identities() });
    await expect(m.deleteAttachment('att-1', person('jim'))).resolves.toBe(true);
    expect(destroyed).toEqual(['att-1']);
    expect(sink).toHaveLength(1);
    expect(sink[0]).toMatchObject({ eventType: 'asset-delete', user: 'jim', metadata: { attachmentId: 'att-1', filename: 'att-1.pdf' } });
    expect(order).toEqual(['audit', 'destroy']);
  });

  test('a record not yet converted to an identity id (the plain username) still matches', async () => {
    const { m, destroyed } = make({ files: { 'att-1': 'jim' }, identities: identities() });
    await expect(m.deleteAttachment('att-1', person('jim'))).resolves.toBe(true);
    expect(destroyed).toEqual(['att-1']);
  });

  test('someone who holds asset-delete still deletes a file they did not upload', async () => {
    const { m, destroyed } = make({ files: { 'att-1': BOB }, assetDelete: 'permit', identities: identities() });
    await expect(m.deleteAttachment('att-1', person('jim'))).resolves.toBe(true);
    expect(destroyed).toEqual(['att-1']);
  });
});

describe('#2534 nobody else gets the exception', () => {
  const refused = async (setup: Setup, ctx: ActorContext, id = 'att-1') => {
    const made = make(setup);
    await expect(made.m.deleteAttachment(id, ctx)).rejects.toThrow(/Permission denied/);
    expect(made.destroyed).toEqual([]);
    expect(made.sink).toEqual([]);
  };

  test('another person is refused', async () => {
    await refused({ files: { 'att-1': JIM }, identities: identities() }, person('bob'));
  });

  test('id confusion: owning file A gives no right over file B', async () => {
    // The ids are content hashes; the rule must read the record of the file being deleted.
    await refused({ files: { 'att-A': JIM, 'att-B': BOB }, identities: identities() }, person('jim'), 'att-B');
  });

  test('a file with no recorded uploader is refused, even for a person named Unknown', async () => {
    await refused({ files: { 'att-1': 'Unknown' }, identities: identities() }, person('Unknown'));
    await refused({ files: { 'att-1': '' }, identities: identities() }, person('jim'));
  });

  test('an orphaned uploader matches nobody, a later account of the same name included', async () => {
    await refused({ files: { 'att-1': 'orphan:jim' }, identities: identities() }, person('jim'));
  });

  test('a file that does not exist is refused, not found-and-allowed', async () => {
    await refused({ files: {}, identities: identities() }, person('jim'));
  });

  test('an anonymous request is refused', async () => {
    await refused({ files: { 'att-1': 'anonymous' }, identities: identities() },
      { username: 'anonymous', isAuthenticated: false, roles: ['anonymous'] });
  });

  test('an asserted username with no sign-in behind it is refused', async () => {
    await refused({ files: { 'att-1': JIM }, identities: identities() }, person('jim', { isAuthenticated: false }));
  });

  test('a context with an empty username is refused', async () => {
    await refused({ files: { 'att-1': '' }, identities: identities() }, person(''));
  });

  test('a job is refused, with or without a person named', async () => {
    await refused({ files: { 'att-1': JIM }, identities: identities() }, jobContextFromRequest(null));
    await refused({ files: { 'att-1': JIM }, identities: identities() }, jobContextFromOperator('jim', 'test'));
  });

  test.each([
    ['an agent token', { viaToken: { id: 't', scopes: ['asset-delete'] } }],
    ['a share link', { viaShare: { id: 's', issuer: 'jim', actions: ['asset-delete'], resources: [], expiresAt: null } }],
    ['a proxy claim', { viaProxy: { kind: 'proxy', grantId: 'g', actor: 'bob', scopes: ['asset-delete'] } }]
  ])('a request carrying %s is bounded by its ceiling and gets no exception', async (_n, extra) => {
    await refused({ files: { 'att-1': JIM }, identities: identities() }, person('jim', extra));
  });

  test('an explicit deny policy beats the exception', async () => {
    await refused({ files: { 'att-1': JIM }, assetDelete: 'deny', identities: identities() }, person('jim'));
  });

  test('a policy engine that cannot answer fails closed', async () => {
    await refused({ files: { 'att-1': JIM }, assetDelete: 'no_evaluator', identities: identities() }, person('jim'));
  });

  test('a record that cannot be read denies rather than guesses', async () => {
    await refused({ files: { 'att-1': JIM }, metadataFails: true, identities: identities() }, person('jim'));
  });

  test('an identity store that cannot answer denies a record that names an identity id', async () => {
    await refused({ files: { 'att-1': JIM }, identities: fakeIdentityManager({ jim: JIM }, { failLookups: true }) }, person('jim'));
  });
});

describe('#2534 the audit record gates the delete', () => {
  test('when the audit record cannot be written, nothing is destroyed', async () => {
    const { m, destroyed } = make({ files: { 'att-1': JIM }, identities: identities(), auditFails: true });
    await expect(m.deleteAttachment('att-1', person('jim'))).rejects.toThrow();
    expect(destroyed).toEqual([]);
  });
});

describe('#2534 the button asks the same question as the door', () => {
  test.each([
    ['the uploader', 'jim', { 'att-1': JIM }, 'silent', true],
    ['someone else', 'bob', { 'att-1': JIM }, 'silent', false],
    ['a permission holder', 'bob', { 'att-1': JIM }, 'permit', true],
    ['the uploader under an explicit deny', 'jim', { 'att-1': JIM }, 'deny', false]
  ] as const)('%s', async (_n, user, files, assetDelete, expected) => {
    const { m, destroyed } = make({ files: { ...files }, assetDelete, identities: identities() });
    const ctx = person(user);
    expect(await m.mayDeleteAttachment(ctx, 'att-1')).toBe(expected);
    if (expected) {
      await expect(m.deleteAttachment('att-1', ctx)).resolves.toBe(true);
    } else {
      await expect(m.deleteAttachment('att-1', ctx)).rejects.toThrow(/Permission denied/);
      expect(destroyed).toEqual([]);
    }
  });

  test('asking records nothing and destroys nothing', async () => {
    const { m, sink, destroyed } = make({ files: { 'att-1': JIM }, identities: identities() });
    await m.mayDeleteAttachment(person('jim'), 'att-1');
    expect(sink).toEqual([]);
    expect(destroyed).toEqual([]);
  });
});
