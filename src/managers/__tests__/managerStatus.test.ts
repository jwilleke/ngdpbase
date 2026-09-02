import BaseManager from '../BaseManager';
import type { PathPreflightOptions } from '../../utils/PathPreflight';

/**
 * Force the darwin branch of `checkConfiguredPath`, with the mount absent.
 *
 * Without this the degraded assertion below could only pass on macOS: the
 * check runs on darwin alone, so on Linux CI it returned ok, the state stayed
 * `ready`, and the Test Suite was red on EVERY run. A permanently-red check is
 * one nobody reads, which is worse than the gap it was reporting.
 */
const AS_DARWIN_UNMOUNTED: PathPreflightOptions = {
  platform: 'darwin',
  isDirectory: () => false
};

/**
 * #1155 — 13 managers can end up degraded and exactly one said so.
 *
 * `preflightConfiguredPath()` already existed and 11 managers called it, but a
 * failed path only logged a line and switched the feature off. So a mistyped
 * `ngdpbase.backup.directory` meant backups silently never ran, while the
 * instance answered 302, readiness said ok, and the dashboard said nothing.
 */
class Probe extends BaseManager {
  runPreflight(key: string, path: string | null, options?: PathPreflightOptions): void {
    this.preflightConfiguredPath(key, path, options);
  }
  goDisabled(reason: string): void { this.markDisabled(reason); }
  goReady(): void { this.markReady(); }
  goDegraded(reason: string, key?: string): void { this.markDegraded(reason, key); }
  goDegradedAndReport(reason: string, key?: string): boolean { return this.markDegraded(reason, key); }
}

const engine = () => ({ getManager: () => null }) as never;

describe('#1155 — a manager states which it is', () => {
  test('a fresh manager is ready', () => {
    expect(new Probe(engine()).getManagerStatus().state).toBe('ready');
  });

  test('a failed path leaves it degraded, with the reason and the config key', () => {
    // checkConfiguredPath only detects ONE thing: a macOS /Volumes/ path whose
    // mount is absent (#645 tracks widening it). A mistyped path elsewhere is
    // not caught at all — which is worth knowing, because it means this state
    // is set less often than "11 managers call preflight" suggests.
    const m = new Probe(engine());
    m.runPreflight(
      'ngdpbase.backup.directory',
      '/Volumes/definitely-not-mounted/backups',
      AS_DARWIN_UNMOUNTED
    );
    const status = m.getManagerStatus();
    expect(status.state).toBe('degraded');
    expect(status.configKey).toBe('ngdpbase.backup.directory');
    expect(status.reason).toBeTruthy();
  });

  test('a path preflight does not inspect leaves it ready', () => {
    const m = new Probe(engine());
    m.runPreflight('ngdpbase.some.dir', process.cwd());
    expect(m.getManagerStatus().state).toBe('ready');
  });

  test('disabled is not degraded', () => {
    // The distinction that decides whether the report is worth reading. An
    // operator who turned comments off does not want a warning about comments.
    const m = new Probe(engine());
    m.goDisabled('comments are switched off');
    expect(m.getManagerStatus().state).toBe('disabled');
    expect(m.getManagerStatus().state).not.toBe('degraded');
  });

  test('a reason is required to leave ready, and survives', () => {
    const m = new Probe(engine());
    m.goDegraded('the directory is not writable', 'ngdpbase.x');
    expect(m.getManagerStatus().reason).toBe('the directory is not writable');
    expect(m.getManagerStatus().configKey).toBe('ngdpbase.x');
  });

  test('recovering clears the reason rather than leaving a stale one', () => {
    const m = new Probe(engine());
    m.goDegraded('broken', 'ngdpbase.x');
    m.goReady();
    expect(m.getManagerStatus().state).toBe('ready');
    expect(m.getManagerStatus().reason).toBeUndefined();
    expect(m.getManagerStatus().configKey).toBeUndefined();
  });
});

describe('#1155 — only a TRANSITION is an event', () => {
  test('degrading twice for the same reason reports one transition', () => {
    // Otherwise every boot re-emits the same twelve events and the signal is
    // buried in its own noise.
    const m = new Probe(engine());
    expect(m.goDegradedAndReport('broken', 'ngdpbase.x')).toBe(true);
    expect(m.goDegradedAndReport('broken', 'ngdpbase.x')).toBe(false);
  });

  test('a DIFFERENT reason is a new transition', () => {
    const m = new Probe(engine());
    expect(m.goDegradedAndReport('disk full', 'ngdpbase.x')).toBe(true);
    expect(m.goDegradedAndReport('permission denied', 'ngdpbase.x')).toBe(true);
  });

  test('recovering and degrading again is a new transition', () => {
    const m = new Probe(engine());
    expect(m.goDegradedAndReport('broken', 'ngdpbase.x')).toBe(true);
    m.goReady();
    expect(m.goDegradedAndReport('broken', 'ngdpbase.x')).toBe(true);
  });
});
