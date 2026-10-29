/**
 * A feed record's content hash (D6, #685): what change-detection compares.
 *
 * One function, used by the record store (the hash it keeps beside each
 * record) and by the shims (the item key the import engine remembers each
 * item by, #2109), so the two can never disagree: the hashes in record
 * stores written before the feeds moved onto the engine still match.
 */

import { createHash } from 'node:crypto';

/** Stable JSON (recursively sorted keys) so the hash is order-independent. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Content hash of a record — its id and properties, never the volatile
 * `fetchedAt` (D6). The same sha256 hex DeltaStorage.calculateHash gives, so
 * stored hashes still match (#1813).
 */
export function recordHash(rec: { sourceRecordId: string; properties: Record<string, unknown> }): string {
  return createHash('sha256').update(stableStringify({ sourceRecordId: rec.sourceRecordId, properties: rec.properties }), 'utf8').digest('hex');
}
