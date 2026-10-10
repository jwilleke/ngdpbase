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

/** Pages: text, names, audiences, links, comments and footnotes. PageManager bumps it after every page change. */
export const PAGE_DATA_TOPIC = 'PageManager';
/** Configuration, policies and role definitions. ConfigurationManager bumps it after every saved change. */
export const CONFIG_DATA_TOPIC = 'ConfigurationManager';
/** Accounts: display names, roles, preferences. UserManager bumps it after every account change. */
export const USER_DATA_TOPIC = 'UserManager';

/** Attachments: files, their metadata and which pages mention them. AttachmentManager bumps it after every write. */
export const ATTACHMENT_DATA_TOPIC = 'AttachmentManager';
/** The media library index. MediaManager bumps it after every scan, rebuild or metadata change. */
export const MEDIA_DATA_TOPIC = 'MediaManager';

/**
 * What every cached page render reads (#1751): any page can link, list or
 * include pages, show configuration and name people, so each render depends
 * on these. A plugin adds its own data with `context.dependsOn(topic)`.
 */
export const BASE_RENDER_TOPICS: readonly string[] = [PAGE_DATA_TOPIC, CONFIG_DATA_TOPIC, USER_DATA_TOPIC];

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
