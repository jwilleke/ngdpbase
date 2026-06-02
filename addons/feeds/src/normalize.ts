/**
 * Project a normalized feed record onto an `Article` CreativeWork (#685 slice 4).
 *
 * Operator decision (2026-06-02): feed records map to **Article** — the generic
 * CreativeWork — not a dedicated Event/NewsArticle type (those aren't in the
 * SchemaType union, and extending it is a deferred core-type decision). The
 * Article is the *catalog projection* (name / description / dateCreated /
 * keywords) consumed by search + JSON-LD; the full structured `properties` bag
 * stays in the RecordStore for richer rendering by `[DataFeed]` (slice 7).
 * The config `type` (e.g. 'Event') is carried as `keywords` + `ngdp:category`,
 * a domain label, not the schema `@type`.
 */

import type { Article, CreativeWork } from '../../../dist/src/types/Schema.js';
import type { NormalizedRecord } from './adapters/types.js';
import type { FeedSourceConfig } from './types.js';

/**
 * CreativeWork union members the feeds addon can currently PROJECT to. The
 * union also has ImageObject/VideoObject/AudioObject/DigitalDocument; those
 * mappers are added per media-feed driver (config-parse rejects an
 * unimplemented `schemaType` so nothing silently breaks). A feed source
 * registers as its `schemaType` (design §4.2) — see config.ts validation.
 */
export const SUPPORTED_SCHEMA_TYPES = ['Article'] as const;
export type SupportedSchemaType = typeof SUPPORTED_SCHEMA_TYPES[number];

/** First defined string-ish property among the candidate keys. */
function firstString(props: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = props[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

/** Best-effort ISO date from common timestamp shapes (epoch ms, epoch s, ISO). */
function toIso(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Heuristic: > 1e12 = ms, otherwise treat as seconds.
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

/**
 * Project a record to the CreativeWork subtype declared by the source's
 * `schemaType`. Dispatches per type; only 'Article' is implemented today
 * (config-parse guarantees `schemaType` is supported, so the default is safe).
 */
export function recordToCreativeWork(rec: NormalizedRecord, cfg: FeedSourceConfig): CreativeWork {
  switch (cfg.schemaType) {
  case 'Article':
  default:
    return recordToArticle(rec, cfg);
  }
}

/**
 * Human-readable name for a record: first title-ish property, else a
 * `<prefix> <id>` fallback. Shared by the Article projection and the
 * `[DataFeed]` list renderer (one impl, no duplication).
 */
export function recordName(rec: NormalizedRecord, fallbackPrefix = ''): string {
  return firstString(rec.properties, ['title', 'headline', 'name', 'place', 'summary'])
    ?? `${fallbackPrefix} ${rec.sourceRecordId}`.trim();
}

export function recordToArticle(rec: NormalizedRecord, cfg: FeedSourceConfig): Article {
  const props = rec.properties;
  const landing = `/feeds/${cfg.sourceId}/${rec.sourceRecordId}`;

  const name = recordName(rec, cfg.sourceId);

  const description = firstString(props, ['description', 'summary', 'detail']);

  const dateCreated = toIso(props.occurredAt ?? props.time ?? props.date ?? props.pubDate ?? props.published);

  const article: Article = {
    '@type': 'Article',
    '@id': landing,
    identifier: `${cfg.sourceId}:${rec.sourceRecordId}`,
    name,
    url: landing,
    keywords: [cfg.type],
    'ngdp:category': cfg.type
  };
  if (description) article.description = description;
  if (dateCreated) article.dateCreated = dateCreated;

  return article;
}
