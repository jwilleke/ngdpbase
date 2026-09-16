/**
 * Per-site record of the shipped pages a site has seeded (#1405).
 *
 * A shipped page (a required page, or a page an addon ships) is seeded once per
 * site. Once a uuid is in the record, the seeder never seeds it again: if it is
 * no longer live, it was removed on this site and stays removed.
 *
 * The trash alone cannot carry that: the retention purge forgets a deleted page
 * after `ngdpbase.page.delete.retentiondays`, and `filesystemprovider` has no
 * trash at all. The record works the same for every provider.
 *
 * Stored as JSON in the instance data folder, one uuid set per source:
 *
 * ```json
 * { "version": 1, "sources": { "required-pages": { "<uuid>": "2026-09-16T…" } } }
 * ```
 */
import path from 'path';
import fse from 'fs-extra';
import writeFileAtomic from './atomicWrite.js';

export const SEEDED_SHIPPED_PAGES_FILE = 'seeded-shipped-pages.json';

interface SeededShippedPagesFile {
  version: 1;
  /** Source id → uuid → when the site first recorded it */
  sources: Record<string, Record<string, string>>;
}

export class SeededShippedPages {
  private constructor(
    private readonly filePath: string,
    private readonly data: SeededShippedPagesFile
  ) {}

  /**
   * Load the record from the instance data folder. A missing file is an empty
   * record; an unreadable one is an error, so the seeder cannot mistake a broken
   * record for a site that has seeded nothing.
   */
  static async load(instanceDataFolder: string): Promise<SeededShippedPages> {
    const filePath = path.join(instanceDataFolder, SEEDED_SHIPPED_PAGES_FILE);
    if (!(await fse.pathExists(filePath))) {
      return new SeededShippedPages(filePath, { version: 1, sources: {} });
    }
    const parsed = await fse.readJson(filePath) as Partial<SeededShippedPagesFile>;
    return new SeededShippedPages(filePath, { version: 1, sources: parsed.sources ?? {} });
  }

  /** Whether this site has a record for the source at all. */
  hasSource(sourceId: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.data.sources, sourceId);
  }

  /** Whether the uuid was ever seeded from the source on this site. */
  has(sourceId: string, uuid: string): boolean {
    return Boolean(this.data.sources[sourceId]?.[uuid.toLowerCase()]);
  }

  /** Record a uuid for the source. Returns true when it was not recorded before. */
  add(sourceId: string, uuid: string, at: string = new Date().toISOString()): boolean {
    const source = (this.data.sources[sourceId] ??= {});
    const key = uuid.toLowerCase();
    if (source[key]) return false;
    source[key] = at;
    return true;
  }

  /** Start an empty record for the source, so `hasSource` is true from now on. */
  startSource(sourceId: string): void {
    this.data.sources[sourceId] ??= {};
  }

  async save(): Promise<void> {
    await fse.ensureDir(path.dirname(this.filePath));
    await writeFileAtomic(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
  }
}
