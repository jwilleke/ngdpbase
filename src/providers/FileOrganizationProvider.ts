import { promises as fs } from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { writeFileAtomic } from '../utils/atomicWrite.js';
import { KeyedSerial } from '../utils/keyedSerial.js';
import { filenameFromOrg } from '../utils/orgFilename.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import type { OrganizationProvider } from '../types/OrganizationProvider.js';
import type { Organization, OrganizationUpdate } from '../types/Organization.js';
import type { ProviderInfo } from '../types/Provider.js';

interface NodeError extends Error {
  code?: string;
}

/**
 * FileOrganizationProvider — JSON-file-per-org storage (#617)
 *
 * One file per organization under `ngdpbase.application.organization.storagedir`.
 * Filename is the install-supplied filename (for the anchor org) or a slug of
 * the org's `name`. Writes are atomic (temp file + rename).
 */
class FileOrganizationProvider implements OrganizationProvider {
  engine: WikiEngine;
  initialized = false;
  private storageDir: string | null = null;
  /** #2015: one change at a time per organization `@id`, so a read-merge-write sees the last write. */
  private readonly records = new KeyedSerial();

  constructor(engine: WikiEngine) {
    this.engine = engine;
  }

  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('FileOrganizationProvider requires ConfigurationManager');
    }

    this.storageDir = configManager.getResolvedDataPath(
      'ngdpbase.application.organization.storagedir',
      './data/organizations'
    );

    await fs.mkdir(this.storageDir, { recursive: true });

    this.initialized = true;
    logger.info(`🏢 FileOrganizationProvider initialized at ${this.storageDir}`);
  }

  getProviderInfo(): ProviderInfo {
    return {
      name: 'FileOrganizationProvider',
      version: '1.0.0',
      description: 'JSON-file-per-organization storage backed by the local filesystem',
      features: ['list', 'create', 'update', 'delete']
    };
  }

  async list(): Promise<Organization[]> {
    const dir = this.requireDir();
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (err) {
      const e = err as NodeError;
      if (e.code === 'ENOENT') return [];
      throw err;
    }

    const orgs: Organization[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const org = await this.readFile(path.join(dir, entry));
      if (org) orgs.push(org);
    }
    return orgs;
  }

  async getById(id: string): Promise<Organization | null> {
    const all = await this.list();
    return all.find((o) => o['@id'] === id) ?? null;
  }

  async getByFile(filename: string): Promise<Organization | null> {
    if (!filename) return null;
    const dir = this.requireDir();
    return this.readFile(path.join(dir, filename));
  }

  create(org: Organization, filename?: string): Promise<Organization> {
    return this.records.run(org['@id'], () => this.createNow(org, filename));
  }

  private async createNow(org: Organization, filename?: string): Promise<Organization> {
    const dir = this.requireDir();
    const resolvedFilename = filename || filenameFromOrg({ url: org.url, name: org.name });
    const target = path.join(dir, resolvedFilename);

    if (await this.fileExists(target)) {
      throw new Error(
        `[FileOrganizationProvider] Cannot create organization: a file already exists at ${resolvedFilename}. ` +
        `Filenames must be unique within ${dir}. Use update() to modify the existing record.`
      );
    }

    const conflict = await this.findFileWithId(org['@id']);
    if (conflict) {
      throw new Error(
        `[FileOrganizationProvider] Cannot create organization with @id="${org['@id']}": ` +
        `another organization (${conflict}) already uses that @id. ` +
        `@id values must be unique within ${dir}.`
      );
    }

    await this.writeAtomic(target, org);
    return org;
  }

  update(id: string, patch: OrganizationUpdate): Promise<Organization | null> {
    return this.records.run(id, () => this.updateNow(id, patch));
  }

  private async updateNow(id: string, patch: OrganizationUpdate): Promise<Organization | null> {
    const dir = this.requireDir();
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const filePath = path.join(dir, entry);
      const existing = await this.readFile(filePath);
      if (existing && existing['@id'] === id) {
        const merged: Organization = {
          ...existing,
          ...patch,
          '@context': existing['@context'],
          '@type': existing['@type'],
          '@id': existing['@id']
        };
        await this.writeAtomic(filePath, merged);
        return merged;
      }
    }
    return null;
  }

  delete(id: string): Promise<boolean> {
    return this.records.run(id, () => this.deleteNow(id));
  }

  private async deleteNow(id: string): Promise<boolean> {
    const dir = this.requireDir();
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const filePath = path.join(dir, entry);
      const existing = await this.readFile(filePath);
      if (existing && existing['@id'] === id) {
        await fs.unlink(filePath);
        return true;
      }
    }
    return false;
  }

  private requireDir(): string {
    if (!this.storageDir) {
      throw new Error('FileOrganizationProvider not initialized');
    }
    return this.storageDir;
  }

  private async readFile(filePath: string): Promise<Organization | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as Organization;
    } catch (err) {
      const e = err as NodeError;
      if (e.code === 'ENOENT') return null;
      logger.warn(`🏢 Failed to read organization file ${filePath}: ${e.message}`);
      return null;
    }
  }

  /** #2015: the shared temp-then-rename, whose temp names never collide. */
  private writeAtomic(target: string, value: unknown): Promise<void> {
    return writeFileAtomic(target, JSON.stringify(value, null, 2));
  }

  private async fileExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  private async findFileWithId(id: string): Promise<string | null> {
    const dir = this.requireDir();
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (err) {
      const e = err as NodeError;
      if (e.code === 'ENOENT') return null;
      throw err;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const existing = await this.readFile(path.join(dir, entry));
      if (existing && existing['@id'] === id) {
        return entry;
      }
    }
    return null;
  }
}

export default FileOrganizationProvider;
