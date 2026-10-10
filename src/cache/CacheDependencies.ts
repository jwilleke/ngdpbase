/**
 * What a cached render read (#1751).
 *
 * A render declares each data topic it depends on — by convention the name of
 * the manager that owns the data, such as `LedgerManager` — before it reads.
 * The topic's version is snapshotted at that moment, so a write that lands
 * while the render is still running leaves the entry already stale rather
 * than wrongly current. The manager bumps its topic after a write
 * (`CacheManager.bump`), and `RegionCache.getOrSetVersioned` re-renders.
 *
 * A render whose output changes with nothing written (a clock) marks itself
 * volatile: it is returned but never stored.
 */
export type VersionLookup = (topic: string) => Promise<string>;

export default class CacheDependencies {
  private readonly snapshots = new Map<string, Promise<string>>();
  private volatile = false;

  constructor(private readonly versionOf: VersionLookup) {}

  /** This render reads `topic`'s data. Call it before reading. */
  dependsOn(topic: string): void {
    if (topic && !this.snapshots.has(topic)) this.snapshots.set(topic, this.versionOf(topic));
  }

  /** This render's output changes on its own; do not store it. */
  markVolatile(): void {
    this.volatile = true;
  }

  isVolatile(): boolean {
    return this.volatile;
  }

  /** Each declared topic with the version it had when declared. */
  async resolved(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [topic, version] of this.snapshots) out[topic] = await version;
    return out;
  }
}
