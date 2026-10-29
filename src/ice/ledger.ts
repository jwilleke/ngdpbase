/**
 * Where the engine keeps fingerprints, per-file status and item keys (#1979).
 *
 * Proposed answer to the open question (docs/planning/ice-planing.md): a
 * ledger of the engine's own, behind the `IceLedger` interface. The
 * application database is off by default (`ngdpbase.database.provider: none`)
 * and the files layer (#1851) has no write door yet, so the first store is a
 * JSON file per scope under `ngdpbase.import.engine.ledger-dir` (FAST_STORAGE).
 * A table in the application database implements the same interface when that
 * is on; phr's `phr_source_files` rows map one to one onto `LedgerFileEntry`.
 *
 * The ledger is the engine's bookkeeping, not anyone's content: it holds
 * names, fingerprints, statuses and the receivers' references, never the
 * bytes or the records.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import type { IceLedger, LedgerFileEntry } from './types.js';
import { KeyedSerial } from '../utils/keyedSerial.js';

/**
 * The ledger file form (#2013). A scope is bound to its receiver and user
 * (`boundScope`); a file without this form was written before that binding,
 * under a scope any caller could name, so it belongs to nobody: it is read
 * as empty, never as anyone's history, and its files are imported once more.
 */
export const LEDGER_FORM = 2;

interface ScopeFile {
  form?: number;
  scope: string;
  files: LedgerFileEntry[];
  items: string[];
}

/** Keeps the newest entry per fingerprint, at most `maxEntries` files and item keys per scope. */
abstract class ScopedLedger implements IceLedger {
  constructor(private readonly maxEntries: number) {}

  protected abstract load(scope: string): Promise<ScopeFile>;
  protected abstract save(data: ScopeFile): Promise<void>;

  /** One writer per scope at a time, so two runs in one scope cannot lose each other's entries. */
  private readonly chains = new KeyedSerial();
  private serial<T>(scope: string, work: () => Promise<T>): Promise<T> {
    return this.chains.run(scope, work);
  }

  async lastFile(scope: string, sha256: string): Promise<LedgerFileEntry | null> {
    const data = await this.load(scope);
    return [...data.files].reverse().find(f => f.sha256 === sha256) ?? null;
  }

  recordFile(scope: string, entry: LedgerFileEntry): Promise<void> {
    return this.serial(scope, async () => {
      const data = await this.load(scope);
      data.files = data.files.filter(f => f.sha256 !== entry.sha256);
      data.files.push(entry);
      if (data.files.length > this.maxEntries) data.files = data.files.slice(-this.maxEntries);
      await this.save(data);
    });
  }

  async hasItem(scope: string, itemKey: string): Promise<boolean> {
    return (await this.load(scope)).items.includes(itemKey);
  }

  recordItem(scope: string, itemKey: string): Promise<void> {
    return this.serial(scope, async () => {
      const data = await this.load(scope);
      if (data.items.includes(itemKey)) return;
      data.items.push(itemKey);
      if (data.items.length > this.maxEntries) data.items = data.items.slice(-this.maxEntries);
      await this.save(data);
    });
  }

  async seenItems(scope: string, itemKeys: string[]): Promise<Set<string>> {
    if (itemKeys.length === 0) return new Set();
    const held = new Set((await this.load(scope)).items);
    return new Set(itemKeys.filter(k => held.has(k)));
  }

  recordItems(scope: string, itemKeys: string[]): Promise<void> {
    if (itemKeys.length === 0) return Promise.resolve();
    return this.serial(scope, async () => {
      const data = await this.load(scope);
      const held = new Set(data.items);
      for (const key of itemKeys) {
        if (held.has(key)) continue;
        held.add(key);
        data.items.push(key);
      }
      if (data.items.length > this.maxEntries) data.items = data.items.slice(-this.maxEntries);
      await this.save(data);
    });
  }

  async files(scope: string): Promise<LedgerFileEntry[]> {
    return (await this.load(scope)).files;
  }
}

/** The ledger in memory: for tests, and for a site that keeps no import history. */
export class MemoryIceLedger extends ScopedLedger {
  private readonly scopes = new Map<string, ScopeFile>();
  constructor(maxEntries = 10_000) { super(maxEntries); }
  protected async load(scope: string): Promise<ScopeFile> {
    const held = this.scopes.get(scope);
    return held ? { scope, files: [...held.files], items: [...held.items] } : { scope, files: [], items: [] };
  }
  protected async save(data: ScopeFile): Promise<void> {
    this.scopes.set(data.scope, data);
  }
}

/** One JSON file per scope, named by the scope's hash (a scope holds a username). */
export class FileIceLedger extends ScopedLedger {
  constructor(private readonly dir: string, maxEntries: number) { super(maxEntries); }

  private fileFor(scope: string): string {
    return path.join(this.dir, `${createHash('sha256').update(scope).digest('hex').slice(0, 32)}.json`);
  }

  protected async load(scope: string): Promise<ScopeFile> {
    const file = this.fileFor(scope);
    if (!await fs.pathExists(file)) return { scope, files: [], items: [] };
    const data = await fs.readJson(file) as Partial<ScopeFile>;
    if (data.form !== LEDGER_FORM || data.scope !== scope) return { scope, files: [], items: [] };
    return { scope, files: Array.isArray(data.files) ? data.files : [], items: Array.isArray(data.items) ? data.items : [] };
  }

  protected async save(data: ScopeFile): Promise<void> {
    await fs.ensureDir(this.dir);
    const file = this.fileFor(data.scope);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeJson(tmp, { ...data, form: LEDGER_FORM });
    await fs.move(tmp, file, { overwrite: true });
  }
}
