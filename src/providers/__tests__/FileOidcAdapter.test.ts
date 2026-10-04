/**
 * #1571 — the OIDC store: node-oidc-provider's adapter contract on files that
 * survive a restart, expire on time, and are owner-only. A temp directory per
 * test; the temp directory is all that is removed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import FileOidcAdapterStore from '../FileOidcAdapter';

describe('FileOidcAdapter (#1571)', () => {
  let dir: string;
  let clock: number;
  const store = () => new FileOidcAdapterStore(dir, () => clock);

  beforeEach(() => {
    dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1571-')), 'oidc');
    clock = 1_000_000;
  });

  afterEach(() => {
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  });

  test('upsert then find returns a copy of the payload', async () => {
    const s = store();
    s.prepare();
    const grants = s.adapter('Grant');
    await grants.upsert('g1', { accountId: 'molly', clientId: 'app' }, 60);
    const found = await grants.find('g1');
    expect(found).toEqual({ accountId: 'molly', clientId: 'app' });
    found!.accountId = 'changed';
    expect((await grants.find('g1'))?.accountId).toBe('molly');
    expect(await grants.find('missing')).toBeUndefined();
  });

  test('a row is gone once it expires, and is not written back', async () => {
    const s = store();
    const codes = s.adapter('AuthorizationCode');
    await codes.upsert('c1', { grantId: 'g1' }, 60);
    clock += 61_000;
    expect(await codes.find('c1')).toBeUndefined();
    await codes.upsert('c2', { grantId: 'g2' }, 60);
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'AuthorizationCode.json'), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(written)).toEqual(['c2']);
  });

  test('state survives a restart, minus what expired meanwhile', async () => {
    const first = store();
    await first.adapter('Session').upsert('s1', { uid: 'u1', accountId: 'molly' }, 3600);
    await first.adapter('Session').upsert('s2', { uid: 'u2' }, 10);
    await first.flush();
    clock += 11_000;
    const second = store();
    expect(await second.adapter('Session').findByUid('u1')).toEqual({ uid: 'u1', accountId: 'molly' });
    expect(await second.adapter('Session').findByUid('u2')).toBeUndefined();
  });

  test('consume stamps the payload; destroy removes it', async () => {
    const tokens = store().adapter('RefreshToken');
    await tokens.upsert('r1', { grantId: 'g1' }, 60);
    await tokens.consume('r1');
    expect((await tokens.find('r1'))?.consumed).toBe(Math.floor(clock / 1000));
    await tokens.destroy('r1');
    expect(await tokens.find('r1')).toBeUndefined();
  });

  test('findByUserCode finds a device code by the code the person typed', async () => {
    const codes = store().adapter('DeviceCode');
    await codes.upsert('d1', { userCode: 'BCDFGHJK', clientId: 'tv' }, 600);
    expect((await codes.findByUserCode('BCDFGHJK'))?.clientId).toBe('tv');
    expect(await codes.findByUserCode('XXXXXXXX')).toBeUndefined();
  });

  test('revokeByGrantId removes every row of that grant in the model, and only those', async () => {
    const tokens = store().adapter('AccessToken');
    await tokens.upsert('a1', { grantId: 'g1' }, 60);
    await tokens.upsert('a2', { grantId: 'g1' }, 60);
    await tokens.upsert('a3', { grantId: 'g2' }, 60);
    await tokens.revokeByGrantId('g1');
    expect(await tokens.find('a1')).toBeUndefined();
    expect(await tokens.find('a2')).toBeUndefined();
    expect(await tokens.find('a3')).toEqual({ grantId: 'g2' });
  });

  test('files are owner-only, in an owner-only directory (#1560)', async () => {
    const s = store();
    s.prepare();
    await s.adapter('Session').upsert('s1', { uid: 'u1' }, 60);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dir, 'Session.json')).mode & 0o777).toBe(0o600);
  });

  test('an unreadable file starts that model empty rather than failing the provider', async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Grant.json'), '{ torn', { mode: 0o600 });
    const grants = store().adapter('Grant');
    expect(await grants.find('g1')).toBeUndefined();
    await grants.upsert('g1', { accountId: 'molly' }, 60);
    expect((await grants.find('g1'))?.accountId).toBe('molly');
  });

  test('a model name that is not a plain identifier is refused, not turned into a path', () => {
    expect(() => store().adapter('../users')).toThrow(/unusable model name/);
  });

  test('listLive returns the live rows of a model', async () => {
    const s = store();
    await s.adapter('Grant').upsert('g1', { accountId: 'molly', clientId: 'app' }, 60);
    await s.adapter('Grant').upsert('g2', { accountId: 'sam', clientId: 'tv' }, 1);
    clock += 2_000;
    expect(await s.listLive('Grant')).toEqual([{ accountId: 'molly', clientId: 'app' }]);
  });
});
