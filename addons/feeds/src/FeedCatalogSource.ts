/**
 * CatalogSource for one configured feed (#685). One instance per `sourceId`,
 * registered with CatalogManager so feed records query/JSON-LD alongside pages,
 * media and attachments (design §4.2).
 *
 * SKELETON (slice 3): no adapter, no record store yet — list() returns an empty
 * page, get() returns null, rebuild() is a no-op. Slice 4 fills these in behind
 * the same contract (adapter.fetch → parse → DeltaStorage hash → upsert).
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

export class FeedCatalogSource implements CatalogSource {
  readonly sourceId: string;
  readonly types: readonly SchemaType[];
  readonly currentSchemaVersion = 1;

  constructor(private readonly config: FeedSourceConfig) {
    this.sourceId = config.sourceId;
    this.types = [config.type as SchemaType];
  }

  /** The adapter name this source will fetch through (no adapter wired yet — slice 4). */
  get adapter(): string {
    return this.config.adapter;
  }

  list(_query: CatalogQuery): Promise<CatalogPage> {
    return Promise.resolve({ items: [], total: 0 });
  }

  get(_identifier: string): Promise<CreativeWork | null> {
    return Promise.resolve(null);
  }

  rebuild(_opts?: RebuildOpts): Promise<void> {
    return Promise.resolve();
  }
}
