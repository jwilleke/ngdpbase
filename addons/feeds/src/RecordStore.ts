/**
 * Per-source record store (#685 slice 4).
 *
 * Persists normalized records under `<dataPath>/<sourceId>/records.json` on
 * FAST_STORAGE (operational data — never a page, never SLOW_STORAGE; design
 * §4.3). Change-detection reuses the engine's `DeltaStorage.calculateHash`
 * (sha256) over the *content* of each record (sourceRecordId + properties) —
 * NOT `fetchedAt` — so an unchanged upstream record produces no upsert (D6).
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import DeltaStorage from '../../../dist/src/utils/DeltaStorage.js';
import type { NormalizedRecord } from './adapters/types.js';

interface StoredEntry {
  record: NormalizedRecord;
  hash: string;
}

interface StoreFile {
  version: 1;
  updatedAt: string;
  records: Record<string, StoredEntry>;
}

/** Result of an upsert pass — drives ingest logging + (later) admin notifications. */
export interface UpsertResult {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
}

/** Stable JSON (recursively sorted keys) so the hash is order-independent. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Content hash of a record — excludes the volatile fetchedAt (D6). */
function recordHash(rec: NormalizedRecord): string {
  return DeltaStorage.calculateHash(stableStringify({ sourceRecordId: rec.sourceRecordId, properties: rec.properties }));
}

export class RecordStore {
  private readonly file: string;
  private records: Record<string, StoredEntry> = {};
  private loaded = false;

  constructor(baseDir: string, sourceId: string) {
    this.file = path.join(baseDir, sourceId, 'records.json');
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as StoreFile;
      this.records = parsed.records ?? {};
    } catch {
      this.records = {}; // absent / unreadable → empty store
    }
    this.loaded = true;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load();
  }

  /**
   * Replace the store contents with `incoming`, upserting only changed/new
   * records and removing ones no longer present upstream. Returns the counts.
   */
  async upsertAll(incoming: NormalizedRecord[]): Promise<UpsertResult> {
    await this.ensureLoaded();
    const result: UpsertResult = { added: 0, updated: 0, unchanged: 0, removed: 0 };
    const next: Record<string, StoredEntry> = {};

    for (const rec of incoming) {
      const hash = recordHash(rec);
      const prev = this.records[rec.sourceRecordId];
      if (!prev) result.added++;
      else if (prev.hash !== hash) result.updated++;
      else result.unchanged++;
      next[rec.sourceRecordId] = { record: rec, hash };
    }

    for (const id of Object.keys(this.records)) {
      if (!(id in next)) result.removed++;
    }

    this.records = next;
    await this.persist();
    return result;
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const data: StoreFile = { version: 1, updatedAt: new Date().toISOString(), records: this.records };
    await writeFile(this.file, JSON.stringify(data, null, 2), 'utf8');
  }

  async list(): Promise<NormalizedRecord[]> {
    await this.ensureLoaded();
    return Object.values(this.records).map(e => e.record);
  }

  async get(sourceRecordId: string): Promise<NormalizedRecord | null> {
    await this.ensureLoaded();
    return this.records[sourceRecordId]?.record ?? null;
  }
}
