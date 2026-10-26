/**
 * #2041 (identity model step 6): the calendar add-on refers to people by
 * identity `@id`. A reservation's `createdBy` and `_private.requester` are
 * the requester's `@id`; "is this the requester" matches the viewer's `@id`,
 * or their username on a reservation not yet converted; at start-up stored
 * usernames are converted once, under the system context, the events saved
 * once; a username with no account is left and reported on the dashboard.
 * A reservation filed through forms keeps its `requester` (the name typed on
 * the form, not an account).
 *
 * Sabotage checks (each turned a test red once): comparing only
 * `viewer.username` in isRequester; dropping the `urn:` skip; skipping the
 * `fromForm` guard on `requester`.
 */
import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import CalendarDataManager from '../managers/CalendarDataManager';

const IDS: Record<string, string> = { ann: 'urn:uuid:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
const SYSTEM = { username: 'system', origin: 'boot' as const, requestedAt: '2026-10-26T00:00:00Z', reason: 'test' };
let dir: string;
let lookups: string[];

const identities = {
  getByUserIdentifier: async (_ctx: unknown, u: string) => { lookups.push(u); return IDS[u] ? { '@id': IDS[u] } : null; }
} as never;

async function write(events: unknown[]): Promise<void> {
  await fsp.writeFile(path.join(dir, 'clubhouse.json'), JSON.stringify(events));
}

const base = { calendarId: 'clubhouse', title: 'R', start: '2026-11-01T10:00', created: 't', updated: 't' };

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'calendar-2041-'));
  lookups = [];
});
afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

test('the requester is matched by identity @id, or by username on a reservation not yet converted', async () => {
  await write([
    { ...base, id: 'e1', class: 'CONFIDENTIAL', _private: { requester: IDS.ann } },
    { ...base, id: 'e2', class: 'CONFIDENTIAL', _private: { requester: 'ann' } }
  ]);
  const m = new CalendarDataManager(dir);
  await m.load();
  const ann = { username: 'ann', identityId: IDS.ann, isAuthenticated: true, canManage: false };
  const bob = { username: 'bob', identityId: 'urn:uuid:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', isAuthenticated: true, canManage: false };
  const event = (id: string) => m.getById(id)!;
  expect(m.stripPrivate(event('e1'), ann)._private).toBeDefined();
  expect(m.stripPrivate(event('e2'), ann)._private).toBeDefined();
  expect(m.stripPrivate(event('e1'), bob)._private).toBeUndefined();
  await expect(m.cancelReservation('e1', bob)).rejects.toThrow(/Forbidden/);
  await m.cancelReservation('e1', ann);
});

test('start-up converts stored usernames once, leaves a form-filed requester, reports an unknown name, and a second start writes nothing', async () => {
  await write([
    { ...base, id: 'e1', createdBy: 'ann', _private: { requester: 'ann' } },
    { ...base, id: 'e2', createdBy: 'ann', _private: { requester: 'Ann Smith', submittedBy: 'ann' } },
    { ...base, id: 'e3', createdBy: 'gone' },
    { ...base, id: 'e4', createdBy: 'system' }
  ]);
  const first = new CalendarDataManager(dir);
  await first.load();
  await first.convertPeopleToIdentityIds(identities, SYSTEM);
  const saved = JSON.parse(await fsp.readFile(path.join(dir, 'clubhouse.json'), 'utf8')) as Array<{ id: string; createdBy?: string; _private?: Record<string, string> }>;
  const byId = Object.fromEntries(saved.map((e) => [e.id, e]));
  expect(byId.e1).toMatchObject({ createdBy: IDS.ann, _private: { requester: IDS.ann } });
  expect(byId.e2).toMatchObject({ createdBy: IDS.ann, _private: { requester: 'Ann Smith', submittedBy: IDS.ann } });
  expect(byId.e3.createdBy).toBe('gone');
  expect(byId.e4.createdBy).toBe('system');
  expect(first.getManagerStatus()).toMatchObject({ state: 'degraded', kind: 'attention', reason: expect.stringMatching(/^1 calendar reference\(s\) name a user by a username that has no account/) });

  lookups = [];
  const mtime = (await fsp.stat(path.join(dir, 'clubhouse.json'))).mtimeMs;
  const second = new CalendarDataManager(dir);
  await second.load();
  await second.convertPeopleToIdentityIds(identities, SYSTEM);
  expect(lookups).toEqual(['gone']);
  expect((await fsp.stat(path.join(dir, 'clubhouse.json'))).mtimeMs).toBe(mtime);
});
