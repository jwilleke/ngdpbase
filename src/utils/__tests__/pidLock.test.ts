/**
 * #1687 — the single-instance lock lives where any user can write it.
 */
import os from 'os';
import path from 'path';
import { pidLockPath } from '../pidLock';

describe('#1687 pidLockPath', () => {
  test('is in the temp directory, never in the checkout', () => {
    const p = pidLockPath('/app', '/tmp');
    expect(path.dirname(p)).toBe('/tmp');
    expect(p.startsWith('/app')).toBe(false);
    expect(path.dirname(pidLockPath('/app'))).toBe(os.tmpdir());
  });

  test('one lock per checkout: the same checkout, the same file; another checkout, another', () => {
    expect(pidLockPath('/srv/a', '/tmp')).toBe(pidLockPath('/srv/a/', '/tmp'));
    expect(pidLockPath('/srv/a', '/tmp')).not.toBe(pidLockPath('/srv/b', '/tmp'));
  });

  test('named so an operator can find it', () => {
    expect(path.basename(pidLockPath('/app', '/tmp'))).toMatch(/^ngdpbase-[0-9a-f]{16}\.pid$/);
  });
});
