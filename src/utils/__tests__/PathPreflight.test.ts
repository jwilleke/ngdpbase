/**
 * The mount preflight, exercised on every platform.
 *
 * Previously the interesting half of this file sat inside
 * `if (process.platform === 'darwin')`, so on Linux CI the branch that
 * actually does something was never run — and `managerStatus.test.ts`
 * asserted the same behaviour unguarded and failed on every CI run. Two tests
 * of one behaviour, one skipped and one permanently red.
 *
 * The seam in `checkConfiguredPath` replaces both arrangements: the darwin
 * logic is tested everywhere, and the platform gate is tested as a behaviour
 * in its own right rather than as a reason to skip.
 */
import { describe, it, expect } from 'vitest';
import { checkConfiguredPath, type PathPreflightOptions } from '../PathPreflight.js';

/** macOS, with the mount absent — the case the check exists to catch. */
const DARWIN_UNMOUNTED: PathPreflightOptions = { platform: 'darwin', isDirectory: () => false };
/** macOS, with the mount present. */
const DARWIN_MOUNTED: PathPreflightOptions = { platform: 'darwin', isDirectory: () => true };
/** Anywhere else. */
const LINUX: PathPreflightOptions = { platform: 'linux', isDirectory: () => false };

describe('PathPreflight.checkConfiguredPath', () => {
  it('returns ok for empty / null / undefined input', () => {
    expect(checkConfiguredPath('')).toEqual({ ok: true });
    expect(checkConfiguredPath(null)).toEqual({ ok: true });
    expect(checkConfiguredPath(undefined)).toEqual({ ok: true });
  });

  it('returns ok for paths outside /Volumes', () => {
    expect(checkConfiguredPath('/tmp/foo', DARWIN_UNMOUNTED)).toEqual({ ok: true });
    expect(checkConfiguredPath('./relative/path', DARWIN_UNMOUNTED)).toEqual({ ok: true });
    expect(checkConfiguredPath('/Users/jim/data', DARWIN_UNMOUNTED)).toEqual({ ok: true });
  });

  it('flags a missing /Volumes/<X> mount — on any host, not only macOS', () => {
    const result = checkConfiguredPath('/Volumes/definitely-not-mounted-xyz123/data', DARWIN_UNMOUNTED);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing-mount');
    expect(result.missingMount).toBe('/Volumes/definitely-not-mounted-xyz123');
    expect(result.message).toContain('/Volumes/definitely-not-mounted-xyz123');
  });

  it('returns ok when the mount IS present', () => {
    // The negative control. Without it, a check hardwired to fail on every
    // /Volumes path would pass the test above and be useless.
    expect(checkConfiguredPath('/Volumes/backup-drive/data', DARWIN_MOUNTED)).toEqual({ ok: true });
  });

  it('does nothing off darwin — the platform gate is behaviour, not a skip reason', () => {
    // /Volumes has no special meaning on Linux, so an absent one is not a
    // missing mount. This is why the check is guarded, and asserting it here
    // means the guard is covered rather than being the reason coverage stops.
    expect(checkConfiguredPath('/Volumes/whatever/data', LINUX)).toEqual({ ok: true });
  });

  it('needs at least two segments before it names a mount root', () => {
    expect(checkConfiguredPath('/Volumes', DARWIN_UNMOUNTED)).toEqual({ ok: true });
    expect(checkConfiguredPath('/Volumes/', DARWIN_UNMOUNTED)).toEqual({ ok: true });
  });

  it('defaults to the real platform when no seam is passed', () => {
    // The production path. On a non-darwin host this is ok by the gate; on
    // darwin it is ok because /usr/local is not under /Volumes. Either way the
    // default is exercised rather than assumed.
    expect(checkConfiguredPath('/usr/local')).toEqual({ ok: true });
  });
});
