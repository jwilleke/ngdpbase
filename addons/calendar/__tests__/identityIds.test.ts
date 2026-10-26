/**
 * #2041 (identity model step 6): the calendar add-on refers to people by
 * identity `@id`. A reservation's `createdBy` and `_private.requester` are
 * the requester's `@id`; "is this the requester" matches the viewer's `@id`,
 * or their username on a reservation not yet converted, never an orphan; at
 * start-up stored usernames are converted once, under the system context,
 * the events saved once; a username with no account becomes
 * `orphan:<name>` and is reported on the dashboard. A reservation filed
 * through forms keeps its `requester` (the name typed on the form, not an
 * account). With the identity store down the pass is postponed.
 *
 * Sabotage checks (each turned a test red once): comparing only
 * `viewer.username` in isRequester; leaving the name in place instead of
 * `orphan:<name>` (the new bob then sees old bob's reservation and its
 * requesterEmail); skipping the `submittedBy` guard on `requester`;
 * rethrowing in the conversion's catch.
 */
import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import CalendarDataManager from '../managers/CalendarDataManager';
import { fakeIdentityManager } from '../../../dist/src/test-support/identities.js';

const IDS: Record<string, string> = { ann: 'urn:uuid:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
const SYSTEM = { username: 'system', origin: 'boot' as const, requestedAt: '2026-10-26T00:00:00Z', reason: 'test' };
let dir: string;

async function write(events: unknown[]): Promise<void> {
  await fsp.writeFile(path.join(dir, 'clubhouse.json'), JSON.stringify(events));
}

const saved = async () => Object.fromEntries((JSON.parse(await fsp.readFile(path.join(dir, 'clubhouse.json'), 'utf8')) as Array<{ id: string; createdBy?: string; _private?: Record<string, string> }>).map((e) => [e.id, e]));

const base = { calendarId: 'clubhouse', title: 'R', start: '2026-11-01T10:00', created: 't', updated: 't' };

async function started(accounts: Record<string, string>, opts: { down?: boolean; failLookups?: boolean } = {}) {
  const m = new CalendarDataManager(dir);
  await m.load();
  const identities = fakeIdentityManager(accounts, opts);
  await m.convertPeopleToIdentityIds(identities, SYSTEM);
  return { m, identities };
}

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'calendar-2041-'));
});
afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

test('the requester is matched by identity @id, or by username on a reservation not yet converted', async () => {
  await write([
    { ...base, id: 'e1', class: 'CONFIDENTIAL', _private: { requester: IDS.ann } },
    { ...base, id: 'e2', class: 'CONFIDENTIAL', _private: { requester: 'ann' } },
    { ...base, id: 'e3', class: 'CONFIDENTIAL', _private: { requester: 'orphan:ann' } }
  ]);
  const m = new CalendarDataManager(dir);
  await m.load();
  const ann = { username: 'ann', identityId: IDS.ann, isAuthenticated: true, canManage: false };
  const bob = { username: 'bob', identityId: 'urn:uuid:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', isAuthenticated: true, canManage: false };
  const event = (id: string) => m.getById(id)!;
  expect(m.stripPrivate(event('e1'), ann)._private).toBeDefined();
  expect(m.stripPrivate(event('e2'), ann)._private).toBeDefined();
  expect(m.stripPrivate(event('e3'), ann)._private).toBeUndefined();
  expect(m.stripPrivate(event('e1'), bob)._private).toBeUndefined();
  await expect(m.cancelReservation('e1', bob)).rejects.toThrow(/Forbidden/);
  await m.cancelReservation('e1', ann);
});

test('start-up converts once, orphans a name with no account, leaves a form-filed requester, reports, and a second start writes nothing', async () => {
  await write([
    { ...base, id: 'e1', createdBy: 'ann', _private: { requester: 'ann' } },
    { ...base, id: 'e2', createdBy: 'ann', _private: { requester: 'Ann Smith', submittedBy: 'ann' } },
    { ...base, id: 'e3', createdBy: 'gone' },
    { ...base, id: 'e4', createdBy: 'system' }
  ]);
  const { m: first } = await started(IDS);
  const byId = await saved();
  expect(byId.e1).toMatchObject({ createdBy: IDS.ann, _private: { requester: IDS.ann } });
  expect(byId.e2).toMatchObject({ createdBy: IDS.ann, _private: { requester: 'Ann Smith', submittedBy: IDS.ann } });
  expect(byId.e3.createdBy).toBe('orphan:gone');
  expect(byId.e4.createdBy).toBe('system');
  expect(first.getManagerStatus()).toMatchObject({ state: 'degraded', kind: 'attention', reason: expect.stringMatching(/^1 calendar reference\(s\) are orphaned/) });

  const mtime = (await fsp.stat(path.join(dir, 'clubhouse.json'))).mtimeMs;
  const { identities } = await started(IDS);
  expect(identities.lookups).toEqual([]);
  expect((await fsp.stat(path.join(dir, 'clubhouse.json'))).mtimeMs).toBe(mtime);
});

test.each([{ down: true }, { failLookups: true }])('the identity store down (%o): nothing is converted, the pass is postponed and said so', async (opts) => {
  await write([{ ...base, id: 'e1', createdBy: 'ann', _private: { requester: 'ann' } }]);
  const { m } = await started(IDS, opts);
  expect((await saved()).e1.createdBy).toBe('ann');
  expect(m.getManagerStatus()).toMatchObject({ state: 'degraded', reason: expect.stringContaining('identity store unavailable, conversion postponed') });
});

test('delete bob, convert, create a new bob, restart: the new bob sees and cancels nothing of old bob\'s', async () => {
  await write([{ ...base, id: 'e1', class: 'CONFIDENTIAL', createdBy: 'bob', _private: { requester: 'bob', requesterEmail: 'old-bob@example.test' } }]);
  const accounts: Record<string, string> = { ...IDS };
  await started(accounts);
  accounts.bob = 'urn:uuid:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const { m } = await started(accounts);
  expect((await saved()).e1._private?.requester).toBe('orphan:bob');
  const newBob = { username: 'bob', identityId: accounts.bob, isAuthenticated: true, canManage: false };
  expect(m.stripPrivate(m.getById('e1'), newBob)._private).toBeUndefined();
  await expect(m.cancelReservation('e1', newBob)).rejects.toThrow(/Forbidden/);
});
