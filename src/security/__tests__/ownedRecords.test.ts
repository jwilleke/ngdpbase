/**
 * Add-on record access (#1823).
 *
 * The manager is the enforcement point. It reads `owner` from the row it
 * stored and asks the PDP. A type that declares `owner` is the owner's, or
 * the person a proxy grant represents — a role does not reach past that. A
 * type with no `owner` is policy alone. A refused list is a denial, not zero
 * rows. The claimed owner on a call is ignored: the tests pass one and the
 * door still uses the stored row.
 *
 * Sabotage: drop the owner comparison in `ownerMismatch` and "another user is
 * refused" goes green for bob. Drop the proxy ceiling return in `prepareOwned`
 * and "a proxy grant that does not carry the action" allows the write.
 */
import { randomUUID } from 'node:crypto';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import PolicyInformationPoint from '../PolicyInformationPoint';
import { OwnedRecordError } from '../ownedRecords';
import { jobContextFromRequest } from '../../context/JobContext';
import { buildAddonHost } from '../../utils/addonHost';
import type { PermissionSubject, ProxyClaim } from '../../managers/UserManager';
import type { ActorContext } from '../../context/ActorContext';

const ALICE = `urn:uuid:${randomUUID()}`;
const MOM = `urn:uuid:${randomUUID()}`;
const JIM = `urn:uuid:${randomUUID()}`;
const BOB = `urn:uuid:${randomUUID()}`;
const TREASURER = `urn:uuid:${randomUUID()}`;
const READER = `urn:uuid:${randomUUID()}`;

const IDS: Record<string, string> = { alice: ALICE, mom: MOM, jim: JIM, bob: BOB, trea: TREASURER, reader: READER };

const phrCapability = {
  id: 'phr-access', effect: 'allow', priority: 90,
  subjects: [{ type: 'role', value: 'vault-owner' }],
  resources: [{ type: 'page', pattern: '*' }],
  actions: ['phr-read', 'phr-write', 'phr-delete']
};
const adminOnRecords = {
  id: 'admin-phr', effect: 'allow', priority: 100,
  subjects: [{ type: 'role', value: 'admin' }],
  resources: [{ type: 'phr-record', pattern: '*' }],
  actions: ['phr-read', 'phr-write']
};
const ledgerPolicy = {
  id: 'ledger-treasurer', effect: 'allow', priority: 90,
  subjects: [{ type: 'role', value: 'treasurer' }],
  resources: [{ type: 'ledger-entry', pattern: '*' }],
  actions: ['ledger-read']
};

const resourceTypes = {
  page: { attributes: { owner: { type: 'identity' }, 'system-category': { type: 'string' } } },
  'system-category': {},
  vault: {},
  'shared-folder': {},
  'phr-record': { attributes: { owner: { type: 'identity' }, category: { type: 'string' } } },
  'ledger-entry': { attributes: { fund: { type: 'string' } } }
};

interface Row { id: string; type: string; owner: string; ownerUser: string; body: string }

function person(username: string, roles: string[], extra: Partial<PermissionSubject> = {}): PermissionSubject {
  return { username, roles, isAuthenticated: true, ipAddress: '203.0.113.8', ...extra };
}

async function build(policies: unknown[], grants: Map<string, { owner: string; proxy: string; permissions: string[] }> = new Map()) {
  const roles: Record<string, string[]> = {
    alice: ['vault-owner'],
    mom: ['vault-owner'],
    jim: ['vault-owner'],
    bob: ['admin', 'vault-owner'],
    trea: ['treasurer'],
    reader: ['reader']
  };
  const settings: Record<string, unknown> = {
    'ngdpbase.access.policies.enabled': true,
    'ngdpbase.access.policies': policies,
    'ngdpbase.access.resource-types': resourceTypes
  };
  const managers: Record<string, unknown> = {};
  const engine = { getManager: (name: string) => managers[name] ?? null } as never;
  managers.ConfigurationManager = { getProperty: (k: string, d: unknown) => (k in settings ? settings[k] : d) };
  managers.IdentityManager = {
    identityIdOf: async (_ctx: unknown, username: string) => IDS[username] ?? null
  };
  managers.UserManager = { getUser: async () => null };
  managers.AuthManager = { liveProxyGrant: (id: string) => grants.get(id) ?? null };
  const pip = new PolicyInformationPoint(engine);
  managers.PolicyInformationPoint = pip;
  pip.resolveSubjectNow = async (username: string, job?: string) => {
    if (job) return { username: `job:${job}`, roles: [], isAuthenticated: true, job };
    const held = roles[username];
    return held
      ? { username, roles: held, isAuthenticated: true }
      : { username, roles: [], isAuthenticated: false };
  };
  pip.subjectFor = async (username: string) => {
    const held = roles[username];
    return held ? { username, roles: held, isAuthenticated: true } : null;
  };
  const evaluator = new PolicyEvaluator(engine);
  managers.PolicyEvaluator = evaluator;
  const pdp = new PolicyDecisionPoint(engine);
  managers.PolicyDecisionPoint = pdp;
  await evaluator.initialize();
  return { pdp, engine, settings };
}

/** The fixture door: owner comes from the row, never from `claimedOwner`. */
function door(pdp: PolicyDecisionPoint) {
  const rows: Row[] = [
    { id: 'a1', type: 'phr-record', owner: ALICE, ownerUser: 'alice', body: 'alice-secret' },
    { id: 'm1', type: 'phr-record', owner: MOM, ownerUser: 'mom', body: 'mom-secret' }
  ];
  const audit: Record<string, unknown>[] = [];
  const stored = (id: string) => rows.find((r) => r.id === id);
  return {
    rows, audit,
    async read(subject: ActorContext, id: string, action = 'phr-read', claimedOwner?: string) {
      void claimedOwner;
      const row = stored(id);
      if (!row) return { status: 'missing' as const };
      const decision = await pdp.decideOwnedRecord(subject, {
        action, resource: { type: row.type, id: row.id, attributes: { owner: row.owner, category: 'lab' } }
      });
      audit.push({ result: decision.permit ? 'allow' : 'deny', action, id: row.id, owner: row.owner, reason: decision.reason, list: false });
      if (!decision.permit) return { status: 'deny' as const, decision };
      return { status: 'ok' as const, body: row.body, decision };
    },
    async list(subject: ActorContext, type: string, action: string, claimedOwner?: string) {
      void claimedOwner;
      const decision = await pdp.decideOwnedList(subject, { action, resource: { type } });
      audit.push({ result: decision.decision, action, list: true, filter: decision.decision === 'allow' ? decision.filter : undefined, reason: decision.decision === 'deny' ? decision.reason : undefined });
      if (decision.decision === 'deny') return { status: 'deny' as const, decision, rows: [] as Row[] };
      const owner = decision.filter.find((f) => f.attribute === 'owner');
      const visible = rows.filter((r) => r.type === type && (!owner || (owner.operator === 'equals' && owner.values.length === 1 && owner.values[0] === r.owner)));
      return { status: 'ok' as const, decision, rows: visible };
    }
  };
}

describe('add-on records: owner, then policy (#1823)', () => {
  test('the owner may read and write their own record; the body is the detail', async () => {
    const { pdp } = await build([phrCapability, adminOnRecords, ledgerPolicy]);
    const records = door(pdp);
    const read = await records.read(person('alice', ['vault-owner']), 'a1', 'phr-read', MOM);
    expect(read).toMatchObject({ status: 'ok', body: 'alice-secret' });
    const write = await records.read(person('alice', ['vault-owner']), 'a1', 'phr-write');
    expect(write.status).toBe('ok');
  });

  test('another user is refused, including an admin whose policy names the type, and the stored owner is what is recorded', async () => {
    const { pdp } = await build([phrCapability, adminOnRecords, ledgerPolicy]);
    const records = door(pdp);
    const bob = await records.read(person('bob', ['admin', 'vault-owner']), 'a1', 'phr-read', BOB);
    expect(bob).toMatchObject({ status: 'deny' });
    if (bob.status === 'deny') expect(bob.decision.reason).toBe('not-the-owner');
    expect(bob).not.toHaveProperty('body');
    expect(records.audit).toEqual([
      expect.objectContaining({ result: 'deny', owner: ALICE, id: 'a1', reason: 'not-the-owner' })
    ]);
    const jim = await records.read(person('jim', ['vault-owner']), 'm1');
    expect(jim.status).toBe('deny');
  });

  test('a missing row is not decided from a claimed owner', async () => {
    const { pdp } = await build([phrCapability, adminOnRecords]);
    const records = door(pdp);
    expect(await records.read(person('alice', ['vault-owner']), 'nope', 'phr-read', ALICE)).toEqual({ status: 'missing' });
    expect(records.audit).toEqual([]);
  });

  test('a stored row with no owner cannot be decided', async () => {
    const { pdp } = await build([phrCapability]);
    await expect(pdp.decideOwnedRecord(person('alice', ['vault-owner']) as never, {
      action: 'phr-read', resource: { type: 'phr-record', id: 'a1', attributes: {} }
    })).rejects.toBeInstanceOf(OwnedRecordError);
  });

  test('an undeclared type and a core type are not decided here', async () => {
    const { pdp } = await build([phrCapability]);
    const alice = person('alice', ['vault-owner']);
    await expect(pdp.decideOwnedRecord(alice as never, { action: 'phr-read', resource: { type: 'phr-note', id: 'n' } })).rejects.toBeInstanceOf(OwnedRecordError);
    await expect(pdp.decideOwnedRecord(alice as never, { action: 'page-read', resource: { type: 'page', id: 'Main' } })).rejects.toBeInstanceOf(OwnedRecordError);
  });

  test('a deny on the type still refuses the owner', async () => {
    const denyWrite = {
      id: 'phr-no-write', effect: 'deny', priority: 200,
      subjects: [{ type: 'anyone' }],
      resources: [{ type: 'phr-record', pattern: '*' }],
      actions: ['phr-write']
    };
    const { pdp } = await build([phrCapability, denyWrite]);
    const records = door(pdp);
    const write = await records.read(person('alice', ['vault-owner']), 'a1', 'phr-write');
    expect(write.status).toBe('deny');
    if (write.status === 'deny') expect(write.decision.policyIds).toEqual(['phr-no-write']);
  });

  test('someone without the permission cannot read their own record', async () => {
    const { pdp } = await build([phrCapability, adminOnRecords]);
    const decision = await pdp.decideOwnedRecord(person('reader', ['reader']), {
      action: 'phr-read', resource: { type: 'phr-record', id: 'r1', attributes: { owner: READER } }
    });
    expect(decision.permit).toBe(false);
    expect(decision.reason).not.toBe('not-the-owner');
  });

  test('a list filter is the subject\'s identity only, and a refused list is not zero rows from an allow', async () => {
    const { pdp } = await build([phrCapability, adminOnRecords]);
    const records = door(pdp);
    const listed = await records.list(person('alice', ['vault-owner']), 'phr-record', 'phr-read', MOM);
    expect(listed.status).toBe('ok');
    if (listed.status === 'ok') {
      expect(listed.rows.map((r) => r.id)).toEqual(['a1']);
      expect(listed.decision.filter).toEqual([{ attribute: 'owner', operator: 'equals', values: [ALICE] }]);
    }
    expect(records.audit.filter((e) => e.list)).toHaveLength(1);
    const refused = await records.list(person('reader', ['reader']), 'phr-record', 'phr-read');
    expect(refused.status).toBe('deny');
    if (refused.status === 'deny') expect(refused.decision).toMatchObject({ decision: 'deny' });
    expect(refused.rows).toEqual([]);
  });

  test('a type with no owner is policy alone: the treasurer sees every row, a reader sees a denial', async () => {
    const { pdp } = await build([phrCapability, ledgerPolicy]);
    const allowed = await pdp.decideOwnedList(person('trea', ['treasurer']), { action: 'ledger-read', resource: { type: 'ledger-entry' } });
    expect(allowed).toEqual({ decision: 'allow', filter: [] });
    const one = await pdp.decideOwnedRecord(person('trea', ['treasurer']), {
      action: 'ledger-read', resource: { type: 'ledger-entry', id: 'l1', attributes: { fund: 'general' } }
    });
    expect(one.permit).toBe(true);
    const refused = await pdp.decideOwnedList(person('reader', ['reader']), { action: 'ledger-read', resource: { type: 'ledger-entry' } });
    expect(refused.decision).toBe('deny');
  });

  test('a job runs as the person who started it', async () => {
    const { pdp } = await build([phrCapability, adminOnRecords]);
    const records = door(pdp);
    const own = await records.read(jobContextFromRequest({ username: 'alice' }), 'a1');
    expect(own.status).toBe('ok');
    const other = await records.read(jobContextFromRequest({ username: 'bob' }), 'a1');
    expect(other.status).toBe('deny');
  });
});

describe('proxy grants on an owned record (#1823, #1762)', () => {
  const claim = (scopes: string[]): ProxyClaim => ({ kind: 'proxy', grantId: 'g1', actor: 'jim', scopes });

  test('a proxy within the grant acts as the owner, and one outside it is the ceiling', async () => {
    const grants = new Map([['g1', { owner: 'mom', proxy: 'jim', permissions: ['phr-read'] }]]);
    const { pdp } = await build([phrCapability, adminOnRecords], grants);
    const records = door(pdp);
    const within = person('mom', ['vault-owner'], { viaProxy: claim(['phr-read']) });
    const read = await records.read(within, 'm1', 'phr-read', JIM);
    expect(read).toMatchObject({ status: 'ok', body: 'mom-secret' });
    const listed = await records.list(within, 'phr-record', 'phr-read');
    expect(listed.status).toBe('ok');
    if (listed.status === 'ok') expect(listed.decision.filter).toEqual([{ attribute: 'owner', operator: 'equals', values: [MOM] }]);
    const write = await records.read(person('mom', ['vault-owner'], { viaProxy: claim(['phr-read']) }), 'm1', 'phr-write');
    expect(write.status).toBe('deny');
    if (write.status === 'deny') expect(write.decision.reason).toBe('proxy_scope_deny');
    const notMom = await records.read(within, 'a1');
    expect(notMom.status).toBe('deny');
    if (notMom.status === 'deny') expect(notMom.decision.reason).toBe('not-the-owner');
  });
});

describe('PR #2324 review findings M1 to M4 (#1823)', () => {
  const ledgerCapability = {
    id: 'ledger-cap', effect: 'allow', priority: 90,
    subjects: [{ type: 'role', value: 'treasurer' }],
    resources: [{ type: 'page', pattern: '*' }],
    actions: ['ledger-read']
  };
  const trea = person('trea', ['treasurer']);
  const ledgerRecord = (id: string) => ({ action: 'ledger-read', resource: { type: 'ledger-entry', id, attributes: { fund: 'general' } } });

  test.each([
    ['a site-wide deny on page *', { id: 'ledger-frozen-page', effect: 'deny', priority: 200, subjects: [{ type: 'anyone' }], resources: [{ type: 'page', pattern: '*' }], actions: ['ledger-read'] }],
    ['a deny with no resources', { id: 'no-ledger', effect: 'deny', priority: 200, subjects: [{ type: 'anyone' }], actions: ['ledger-read'] }]
  ])('M1: %s refuses a record and a list that a type policy allows', async (_name, deny) => {
    const { pdp } = await build([ledgerPolicy, deny]);
    const one = await pdp.decideOwnedRecord(trea, ledgerRecord('l1'));
    expect(one).toMatchObject({ permit: false, policyIds: [deny.id] });
    const list = await pdp.decideOwnedList(trea, { action: 'ledger-read', resource: { type: 'ledger-entry' } });
    expect(list).toMatchObject({ decision: 'deny', policyIds: [deny.id] });
  });

  test('M1: a deny with no resources refuses the owner whose type policy allows', async () => {
    const ownerOnRecords = { ...adminOnRecords, id: 'owner-phr', subjects: [{ type: 'role', value: 'vault-owner' }] };
    const deny = { id: 'no-phr', effect: 'deny', priority: 200, subjects: [{ type: 'anyone' }], actions: ['phr-read'] };
    const { pdp } = await build([ownerOnRecords, deny]);
    const read = await door(pdp).read(person('alice', ['vault-owner']), 'a1');
    expect(read.status).toBe('deny');
    if (read.status === 'deny') expect(read.decision.policyIds).toEqual(['no-phr']);
    expect((await door(pdp).list(person('alice', ['vault-owner']), 'phr-record', 'phr-read')).status).toBe('deny');
  });

  test('M2: a type deny on * covers an id starting with a dot; an id with / or no id is not decided', async () => {
    const frozen = { id: 'ledger-frozen', effect: 'deny', priority: 200, subjects: [{ type: 'anyone' }], resources: [{ type: 'ledger-entry', pattern: '*' }], actions: ['ledger-read'] };
    const { pdp } = await build([ledgerCapability, frozen]);
    expect(await pdp.decideOwnedRecord(trea, ledgerRecord('l1'))).toMatchObject({ permit: false, policyIds: ['ledger-frozen'] });
    expect(await pdp.decideOwnedRecord(trea, ledgerRecord('.hidden'))).toMatchObject({ permit: false, policyIds: ['ledger-frozen'] });
    await expect(pdp.decideOwnedRecord(trea, ledgerRecord('a/b'))).rejects.toBeInstanceOf(OwnedRecordError);
    await expect(pdp.decideOwnedRecord(trea, ledgerRecord(''))).rejects.toBeInstanceOf(OwnedRecordError);
  });

  test.each([['.'], ['..'], ['\n'], ['\r'], [' '], ['a\nb']])('M2: the id %j is refused, not decided', async (id) => {
    const { pdp } = await build([ledgerCapability]);
    await expect(pdp.decideOwnedRecord(trea, ledgerRecord(id))).rejects.toBeInstanceOf(OwnedRecordError);
  });

  test.each([['...'], ['a.b'], ['.a'], ['a..b']])('M2: the id %s is still accepted', async (id) => {
    const { pdp } = await build([ledgerCapability]);
    await expect(pdp.decideOwnedRecord(trea, ledgerRecord(id))).resolves.toBeDefined();
  });

  test.each([
    ['"identity"', 'identity'],
    ['{}', {}],
    ['{ type: 1 }', { type: 1 }],
    ['null', null],
    ['{ kind: "identity" }', { kind: 'identity' }]
  ])('M3: owner declared as %s is refused at decision time and at start-up', async (_name, owner) => {
    const { pdp, engine, settings } = await build([phrCapability, adminOnRecords]);
    settings['ngdpbase.access.resource-types'] = { ...resourceTypes, 'phr-record': { attributes: { owner, category: { type: 'string' } } } };
    const bob = person('bob', ['admin', 'vault-owner']);
    await expect(pdp.decideOwnedRecord(bob, { action: 'phr-read', resource: { type: 'phr-record', id: 'a1', attributes: { owner: ALICE } } })).rejects.toBeInstanceOf(OwnedRecordError);
    await expect(pdp.decideOwnedList(bob, { action: 'phr-read', resource: { type: 'phr-record' } })).rejects.toBeInstanceOf(OwnedRecordError);
    await expect(new PolicyEvaluator(engine).initialize()).rejects.toThrow(/phr-record.*owner/);
  });

  test('M4: an anonymous share carrying the capability is refused a record, and its list matches nothing', async () => {
    const { pdp } = await build([ledgerPolicy, ledgerCapability]);
    const visitor: PermissionSubject = {
      username: 'anonymous', roles: ['anonymous'], isAuthenticated: false,
      viaShare: { id: 's1', issuer: 'trea', actions: ['ledger-read'], resources: [{ type: 'page', pattern: '*' }], expiresAt: null }
    };
    expect((await pdp.decideOwnedRecord(visitor, ledgerRecord('l1'))).permit).toBe(false);
    const list = await pdp.decideOwnedList(visitor, { action: 'ledger-read', resource: { type: 'ledger-entry' } });
    expect(list).toMatchObject({ decision: 'deny' });
    expect(list).not.toHaveProperty('filter');
  });
});

describe('host.access stays inside the add-on slug (#1823)', () => {
  test('another type is refused before the PDP, and there is no PDP without a site', async () => {
    const { engine } = await build([phrCapability]);
    const host = buildAddonHost('phr', {}, undefined, engine);
    await expect(host.access.decide(person('alice', ['vault-owner']), {
      action: 'ledger-read', resource: { type: 'ledger-entry', id: 'l1' }
    })).rejects.toThrow(/phr-/);
    await expect(buildAddonHost('phr', {}).access.list(person('alice', ['vault-owner']), {
      action: 'phr-read', resource: { type: 'phr-record' }
    })).rejects.toThrow(/PolicyDecisionPoint/);
  });
});
