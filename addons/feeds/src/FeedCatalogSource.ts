/**
 * CatalogSource for one configured feed (#685). One instance per `sourceId`,
 * registered with CatalogManager so feed records query/JSON-LD alongside pages,
 * media and attachments (design §4.2).
 *
 * Reads from the per-source RecordStore and projects each normalized record to
 * an `Article` (the catalog view; full data stays in the store — see normalize.ts).
 * Feed records are public structured data, so there is no ACL filtering here.
 */

import type {
  CatalogSource,
  CatalogQuery,
  CatalogPage,
  CreativeWork,
  RebuildOpts,
  SchemaType
} from '../../../dist/src/types/Schema.js';
import type { FeedSourceConfig } from './types.js';
import type { RecordStore } from './RecordStore.js';
import { recordToCreativeWork } from './normalize.js';

export class FeedCatalogSource implements CatalogSource {
  readonly sourceId: string;
  readonly types: readonly SchemaType[]; // declared from config.schemaType at registration (default 'Article')
  readonly currentSchemaVersion = 1;

  constructor(private readonly config: FeedSourceConfig, private readonly store: RecordStore) {
    this.sourceId = config.sourceId;
    this.types = [(config.schemaType ?? 'Article') as SchemaType];
  }

  /** The adapter name this source fetches through. */
  get adapter(): string {
    return this.config.adapter;
  }

  async list(query: CatalogQuery): Promise<CatalogPage> {
    const records = await this.store.list();
    const items: CreativeWork[] = records.map(r => recordToCreativeWork(r, this.config));
    const total = items.length;
    const limited = typeof query.limit === 'number' && query.limit > 0 ? items.slice(0, query.limit) : items;
    return { items: limited, total };
  }

  async get(identifier: string): Promise<CreativeWork | null> {
    const prefix = `${this.sourceId}:`;
    const recordId = identifier.startsWith(prefix) ? identifier.slice(prefix.length) : identifier;
    const rec = await this.store.get(recordId);
    return rec ? recordToCreativeWork(rec, this.config) : null;
  }

  /** Re-fetch is driven by FeedManager.ingest(); rebuild() just reloads the store. */
  async rebuild(_opts?: RebuildOpts): Promise<void> {
    await this.store.load();
  }
}
