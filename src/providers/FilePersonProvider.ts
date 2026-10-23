import { promises as fs } from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { writeFileAtomic } from '../utils/atomicWrite.js';
import { KeyedSerial } from '../utils/keyedSerial.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import type { PersonProvider } from '../types/PersonProvider.js';
import type { Person, PersonUpdate } from '../types/Person.js';
import type { ProviderInfo } from '../types/Provider.js';

interface NodeError extends Error {
  code?: string;
}

const URN_UUID_PREFIX = 'urn:uuid:';

/**
 * Extract the uuid portion from a `urn:uuid:<uuid>` `@id`.
 * Falls back to the whole string if the prefix isn't present.
 */
function uuidFromId(id: string): string {
  return id.startsWith(URN_UUID_PREFIX) ? id.slice(URN_UUID_PREFIX.length) : id;
}

/**
 * FilePersonProvider — JSON-file-per-person storage (#617)
 *
 * One file per person under `ngdpbase.application.persons.storagedir`,
 * named `<uuid>.json` where the uuid matches the v4 segment of `@id`.
 */
class FilePersonProvider implements PersonProvider {
  engine: WikiEngine;
  initialized = false;
  private storageDir: string | null = null;
  /** #2015: one change at a time per person file, so a read-merge-write sees the last write. */
  private readonly records = new KeyedSerial();

  constructor(engine: WikiEngine) {
    this.engine = engine;
  }

  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('FilePersonProvider requires ConfigurationManager');
    }

    this.storageDir = configManager.getResolvedDataPath(
      'ngdpbase.application.persons.storagedir',
      './data/persons'
    );

    await fs.mkdir(this.storageDir, { recursive: true });

    this.initialized = true;
    logger.info(`👤 FilePersonProvider initialized at ${this.storageDir}`);
  }

  getProviderInfo(): ProviderInfo {
    return {
      name: 'FilePersonProvider',
      version: '1.0.0',
      description: 'JSON-file-per-person storage backed by the local filesystem',
      features: ['list', 'create', 'update', 'delete', 'lookupByIdentifier']
    };
  }

  async list(): Promise<Person[]> {
    const dir = this.requireDir();
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (err) {
      const e = err as NodeError;
      if (e.code === 'ENOENT') return [];
      throw err;
    }

    const persons: Person[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const person = await this.readFile(path.join(dir, entry));
      if (person) persons.push(person);
    }
    return persons;
  }

  async getById(id: string): Promise<Person | null> {
    const dir = this.requireDir();
    const filePath = path.join(dir, `${uuidFromId(id)}.json`);
    const direct = await this.readFile(filePath);
    if (direct && direct['@id'] === id) return direct;

    // Fallback: scan (handles records whose filename drifted from @id)
    const all = await this.list();
    return all.find((p) => p['@id'] === id) ?? null;
  }

  async getByIdentifier(identifier: string): Promise<Person | null> {
    if (!identifier) return null;
    const all = await this.list();
    return all.find((p) => p.identifier === identifier) ?? null;
  }

  create(person: Person): Promise<Person> {
    return this.records.run(uuidFromId(person['@id']), async () => {
      await this.writeAtomic(this.fileFor(person['@id']), person);
      return person;
    });
  }

  replace(person: Person): Promise<Person> {
    return this.records.run(uuidFromId(person['@id']), async () => {
      await this.writeAtomic(this.fileFor(person['@id']), person);
      return person;
    });
  }

  update(id: string, patch: PersonUpdate): Promise<Person | null> {
    return this.records.run(uuidFromId(id), async () => {
      const existing = await this.getById(id);
      if (!existing) return null;
      const merged: Person = {
        ...existing,
        ...patch,
        '@context': existing['@context'],
        '@type': existing['@type'],
        '@id': existing['@id'],
        identifier: existing.identifier
      };
      await this.writeAtomic(this.fileFor(id), merged);
      return merged;
    });
  }

  delete(id: string): Promise<boolean> {
    return this.records.run(uuidFromId(id), async () => {
      try {
        await fs.unlink(this.fileFor(id));
        return true;
      } catch (err) {
        const e = err as NodeError;
        if (e.code === 'ENOENT') return false;
        throw err;
      }
    });
  }

  /** The file a person `@id` is stored in. */
  private fileFor(id: string): string {
    return path.join(this.requireDir(), `${uuidFromId(id)}.json`);
  }

  private requireDir(): string {
    if (!this.storageDir) {
      throw new Error('FilePersonProvider not initialized');
    }
    return this.storageDir;
  }

  private async readFile(filePath: string): Promise<Person | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as Person;
    } catch (err) {
      const e = err as NodeError;
      if (e.code === 'ENOENT') return null;
      logger.warn(`👤 Failed to read person file ${filePath}: ${e.message}`);
      return null;
    }
  }

  /** #2015: the shared temp-then-rename, whose temp names never collide. */
  private writeAtomic(target: string, value: unknown): Promise<void> {
    return writeFileAtomic(target, JSON.stringify(value, null, 2));
  }
}

export default FilePersonProvider;
