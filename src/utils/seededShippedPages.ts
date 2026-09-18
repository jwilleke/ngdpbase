/**
 * Per-site record of the shipped pages a site has seeded, and the ones it has
 * declined (#1405, #1412).
 *
 * A shipped page (a required page, or a page an addon ships) is seeded once per
 * site. Once a uuid is in the record, the seeder never seeds it again: if it is
 * no longer live, it was removed on this site and stays removed.
 *
 * The trash alone cannot carry that: the retention purge forgets a deleted page
 * after `ngdpbase.page.delete.retentiondays`, and `filesystemprovider` has no
 * trash at all. The record works the same for every provider.
 *
 * A **declined** uuid is one an operator told this site not to take — the page's
 * title or slug belongs to a page the site would rather keep (#1412, #1413).
 * Declines are per source: an addon shipping the same uuid later is still
 * offered, because declining ngdpbase's page says nothing about the addon's.
 *
 * Stored as JSON in the instance data folder:
 *
 * ```json
 * { "version": 2, "sources": { "required-pages": {
 *     "seeded":   { "<uuid>": "2026-09-17T…" },
 *     "declined": { "<uuid>": { "at": "2026-09-18T…", "by": "admin", "reason": "…" } } } } }
 * ```
 *
 * A version 1 file (uuid → date, no declines) is read as `seeded` with no
 * declines, so an upgraded site keeps everything it had.
 */
import path from 'path';
import fse from 'fs-extra';
import writeFileAtomic from './atomicWrite.js';

export const SEEDED_SHIPPED_PAGES_FILE = 'seeded-shipped-pages.json';

/** Why a site declined a shipped page, and who decided. */
export interface DeclinedShippedPage {
  /** When it was declined (ISO 8601) */
  at: string;
  /** Who declined it */
  by: string;
  /** The conflict that prompted it */
  reason: string;
}

interface SeededShippedPagesSource {
  /** uuid → when this site first recorded it */
  seeded: Record<string, string>;
  /** uuid → why this site will not take it */
  declined: Record<string, DeclinedShippedPage>;
}

interface SeededShippedPagesFile {
  version: 2;
  sources: Record<string, SeededShippedPagesSource>;
}

/** A version 1 source (uuid → date) or the version 2 shape. */
type StoredSource = Record<string, string> | Partial<SeededShippedPagesSource>;

function readSource(stored: StoredSource | undefined): SeededShippedPagesSource {
  if (!stored) return { seeded: {}, declined: {} };
  const asV2 = stored as Partial<SeededShippedPagesSource>;
  if (asV2.seeded || asV2.declined) {
    return { seeded: { ...(asV2.seeded ?? {}) }, declined: { ...(asV2.declined ?? {}) } };
  }
  // Version 1: the source map was the seeded map.
  return { seeded: { ...(stored as Record<string, string>) }, declined: {} };
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
      return new SeededShippedPages(filePath, { version: 2, sources: {} });
    }
    const parsed = await fse.readJson(filePath) as { sources?: Record<string, StoredSource> };
    const sources: Record<string, SeededShippedPagesSource> = {};
    for (const [id, stored] of Object.entries(parsed.sources ?? {})) {
      sources[id] = readSource(stored);
    }
    return new SeededShippedPages(filePath, { version: 2, sources });
  }

  /** Whether this site has a record for the source at all. */
  hasSource(sourceId: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.data.sources, sourceId);
  }

  /** Whether the uuid was ever seeded from the source on this site. */
  has(sourceId: string, uuid: string): boolean {
    return Boolean(this.data.sources[sourceId]?.seeded[uuid.toLowerCase()]);
  }

  /** Record a uuid as seeded from the source. Returns true when it was not recorded before. */
  add(sourceId: string, uuid: string, at: string = new Date().toISOString()): boolean {
    const source = this.source(sourceId);
    const key = uuid.toLowerCase();
    if (source.seeded[key]) return false;
    source.seeded[key] = at;
    return true;
  }

  /** Whether this site declined the uuid from that source (#1412). */
  isDeclined(sourceId: string, uuid: string): boolean {
    return Boolean(this.data.sources[sourceId]?.declined[uuid.toLowerCase()]);
  }

  /** Why this site declined the uuid, or undefined. */
  declinedEntry(sourceId: string, uuid: string): DeclinedShippedPage | undefined {
    return this.data.sources[sourceId]?.declined[uuid.toLowerCase()];
  }

  /** Every declined uuid of a source, as uuid → entry. */
  declinedOf(sourceId: string): Record<string, DeclinedShippedPage> {
    return { ...(this.data.sources[sourceId]?.declined ?? {}) };
  }

  /** Every source that has declines, as source id → uuid → entry. */
  allDeclined(): Record<string, Record<string, DeclinedShippedPage>> {
    const out: Record<string, Record<string, DeclinedShippedPage>> = {};
    for (const [id, source] of Object.entries(this.data.sources)) {
      if (Object.keys(source.declined).length > 0) out[id] = { ...source.declined };
    }
    return out;
  }

  /** Decline a uuid from a source. Returns true when it was not declined before. */
  decline(sourceId: string, uuid: string, entry: DeclinedShippedPage): boolean {
    const source = this.source(sourceId);
    const key = uuid.toLowerCase();
    if (source.declined[key]) return false;
    source.declined[key] = entry;
    return true;
  }

  /** Undo a decline. Returns true when there was one. */
  allow(sourceId: string, uuid: string): boolean {
    const source = this.data.sources[sourceId];
    const key = uuid.toLowerCase();
    if (!source?.declined[key]) return false;
    delete source.declined[key];
    return true;
  }

  /** Start an empty record for the source, so `hasSource` is true from now on. */
  startSource(sourceId: string): void {
    this.source(sourceId);
  }

  async save(): Promise<void> {
    await fse.ensureDir(path.dirname(this.filePath));
    await writeFileAtomic(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
  }

  private source(sourceId: string): SeededShippedPagesSource {
    return (this.data.sources[sourceId] ??= { seeded: {}, declined: {} });
  }
}
