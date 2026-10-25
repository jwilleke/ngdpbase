/**
 * #2075 — the account import's file reader and its running-server guard.
 *
 * Sabotage, each seen red then restored: reading `roles` as one string (the
 * CSV roles test); not unquoting `""` (the quoted-cell test); treating a dead
 * PID as running (the guard test).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseAccountFile, runningServerPid } from '../import-accounts';
import { pidLockPath } from '../../src/utils/pidLock';

describe('parseAccountFile', () => {
  test('a JSON list is taken as it is', () => {
    const rows = [{ username: 'alice', email: 'a@example.com', roles: ['editor'], isTest: true }];
    expect(parseAccountFile(JSON.stringify(rows), 'accounts.json')).toEqual(rows);
  });

  test('JSON that is not a list is refused', () => {
    expect(() => parseAccountFile('{"username":"alice"}', 'accounts.json')).toThrow(/not a JSON list/);
  });

  test('CSV: a header row, roles split on ; or |, isTest a boolean, empty cells absent', () => {
    const csv = '﻿username,email,displayName,roles,isTest,createdAt\r\n'
      + 'alice,a@example.com,"Smith, Alice",editor;reader,yes,2020-01-02\r\n'
      + 'bob,b@example.com,,user|admin,0,\r\n'
      + '\r\n'
      + 'carol,c@example.com,"Carol ""C"" Jones",,maybe,\n';
    expect(parseAccountFile(csv, 'accounts.csv')).toEqual([
      { username: 'alice', email: 'a@example.com', displayName: 'Smith, Alice', roles: ['editor', 'reader'], isTest: true, createdAt: '2020-01-02' },
      { username: 'bob', email: 'b@example.com', roles: ['user', 'admin'], isTest: false },
      { username: 'carol', email: 'c@example.com', displayName: 'Carol "C" Jones', isTest: 'maybe' }
    ]);
  });
});

describe('runningServerPid', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-accounts-')); });
  afterEach(() => {
    fs.rmSync(pidLockPath(dir), { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('no lock, or a lock naming a dead process: not running', () => {
    expect(runningServerPid(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, '.ngdpbase.pid'), '999999999');
    expect(runningServerPid(dir)).toBeNull();
  });

  test('a lock naming a live process (the app\'s or server.sh\'s): running', () => {
    fs.writeFileSync(pidLockPath(dir), String(process.pid));
    expect(runningServerPid(dir)).toBe(process.pid);
    fs.rmSync(pidLockPath(dir));
    fs.writeFileSync(path.join(dir, '.ngdpbase.pid'), String(process.pid));
    expect(runningServerPid(dir)).toBe(process.pid);
  });
});
