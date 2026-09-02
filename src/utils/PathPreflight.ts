/**
 * Preflight a configured filesystem path before anything tries to write to it.
 *
 * Detects ONE thing: a macOS `/Volumes/<X>/...` path whose mount is absent,
 * where `fs.ensureDir` would otherwise crash the engine with an opaque
 * `EACCES`. A mistyped path elsewhere is not caught at all — #645 tracks
 * widening it.
 *
 * __The platform is injectable, and that is not a convenience.__ The check
 * runs only on darwin, so on Linux CI the branch was unreachable: every
 * assertion covering it was guarded by `if (process.platform === 'darwin')`
 * and silently skipped, while `managerStatus.test.ts` asserted the degraded
 * state unguarded and failed on every CI run. A test that can only pass on one
 * developer's operating system is not a test of anything CI can protect, and a
 * continuously-red check is one nobody reads.
 *
 * With the seam, the darwin logic is exercised on every platform, and the
 * production default is still `process.platform`.
 */

import * as fs from 'fs';

export interface PathPreflightResult {
  ok: boolean;
  reason?: 'missing-mount';
  missingMount?: string;
  message?: string;
}

/** Test seams. Production passes none of these. */
export interface PathPreflightOptions {
  /**
   * Which platform to check as. Defaults to the real one.
   *
   * Injected rather than stubbed on `process`, because mutating a global for
   * the duration of a test leaks into anything running in parallel.
   */
  platform?: NodeJS.Platform;
  /** How to test for a mounted directory. Defaults to `fs.statSync`. */
  isDirectory?: (path: string) => boolean;
}

function realIsDirectory(path: string): boolean {
  try {
    return fs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function checkConfiguredPath(
  p: string | undefined | null,
  options: PathPreflightOptions = {}
): PathPreflightResult {
  if (!p) return { ok: true };

  const platform = options.platform ?? process.platform;
  const isDirectory = options.isDirectory ?? realIsDirectory;

  if (platform === 'darwin' && p.startsWith('/Volumes/')) {
    const segments = p.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const mountRoot = `/${segments[0]}/${segments[1]}`;
      if (!isDirectory(mountRoot)) {
        return {
          ok: false,
          reason: 'missing-mount',
          missingMount: mountRoot,
          message:
            `Configured path "${p}" expects ${mountRoot} to be a mounted volume, but it is not currently mounted. ` +
            'Mount the volume, or update the configuration to point at an existing path.'
        };
      }
    }
  }

  return { ok: true };
}
