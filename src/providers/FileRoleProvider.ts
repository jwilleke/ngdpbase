import { promises as fs } from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { writeFileAtomic } from '../utils/atomicWrite.js';
import { KeyedSerial } from '../utils/keyedSerial.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import type { RoleProvider } from '../types/RoleProvider.js';
import type { Role, RoleUpdate } from '../types/Role.js';
import type { ProviderInfo } from '../types/Provider.js';

interface NodeError extends Error {
  code?: string;
}

/**
 * FileRoleProvider — JSON-file-per-(org, role) storage (#617 follow-up).
 *
 * One file per `namedPosition` under
 * `ngdpbase.application.roles.storagedir`, named `<namedPosition>.json`.
 * The (organization, namedPosition) pair is the natural key — uniqueness is
 * enforced on `create()`.
 */
class FileRoleProvider implements RoleProvider {
  engine: WikiEngine;
  initialized = false;
  private storageDir: string | null = null;
  /** #2015: one change at a time per role `@id`, so a read-merge-write sees the last write. */
  private readonly records = new KeyedSerial();

  constructor(engine: WikiEngine) {
    this.engine = engine;
  }

  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('FileRoleProvider requires ConfigurationManager');
    }

    this.storageDir = configManager.getResolvedDataPath(
      'ngdpbase.application.roles.storagedir',
      './data/roles'
    );

    await fs.mkdir(this.storageDir, { recursive: true });

    this.initialized = true;
    logger.info(`🔑 FileRoleProvider initialized at ${this.storageDir}`);
  }

  getProviderInfo(): ProviderInfo {
    return {
      name: 'FileRoleProvider',
      version: '1.0.0',
      description: 'JSON-file-per-(org, role) storage backed by the local filesystem',
      features: ['list', 'create', 'update', 'delete', 'lookupByOrgAndPosition', 'listByMember']
    };
  }

  async list(): Promise<Role[]> {
    const dir = this.requireDir();
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (err) {
      const e = err as NodeError;
      if (e.code === 'ENOENT') return [];
      throw err;
    }

    const roles: Role[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const role = await this.readFile(path.join(dir, entry));
      if (role) roles.push(role);
    }
    return roles;
  }

  async getById(id: string): Promise<Role | null> {
    const all = await this.list();
    return all.find((r) => r['@id'] === id) ?? null;
  }

  async getByOrgAndPosition(organizationId: string, namedPosition: string): Promise<Role | null> {
    const dir = this.requireDir();
    const direct = await this.readFile(path.join(dir, `${namedPosition}.json`));
    if (direct && direct.organization?.['@id'] === organizationId && direct.namedPosition === namedPosition) {
      return direct;
    }
    // Fallback: filename drift — scan
    const all = await this.list();
    return all.find((r) => r.organization?.['@id'] === organizationId && r.namedPosition === namedPosition) ?? null;
  }

  async listByMember(personId: string): Promise<Role[]> {
    const all = await this.list();
    return all.filter((r) => Array.isArray(r.member) && r.member.some((m) => m['@id'] === personId));
  }

  create(role: Role): Promise<Role> {
    return this.records.run(role['@id'], () => this.createNow(role));
  }

  private async createNow(role: Role): Promise<Role> {
    const dir = this.requireDir();
    const target = path.join(dir, `${role.namedPosition}.json`);

    if (await this.fileExists(target)) {
      throw new Error(
        `[FileRoleProvider] Cannot create role '${role.namedPosition}': a file already exists at ${role.namedPosition}.json. ` +
        `(organization, namedPosition) pairs must be unique within ${dir}. Use update() to modify the existing record.`
      );
    }

    const conflict = await this.findFileWithId(role['@id']);
    if (conflict) {
      throw new Error(
        `[FileRoleProvider] Cannot create role with @id="${role['@id']}": ` +
        `another role (${conflict}) already uses that @id. ` +
        `@id values must be unique within ${dir}.`
      );
    }

    await this.writeAtomic(target, role);
    return role;
  }

  update(id: string, patch: RoleUpdate): Promise<Role | null> {
    return this.records.run(id, () => this.updateNow(id, patch));
  }

  private async updateNow(id: string, patch: RoleUpdate): Promise<Role | null> {
    const dir = this.requireDir();
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const filePath = path.join(dir, entry);
      const existing = await this.readFile(filePath);
      if (existing && existing['@id'] === id) {
        const merged: Role = {
          ...existing,
          ...patch,
          '@context': existing['@context'],
          '@type': existing['@type'],
          '@id': existing['@id'],
          namedPosition: existing.namedPosition,
          organization: existing.organization
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
      throw new Error('FileRoleProvider not initialized');
    }
    return this.storageDir;
  }

  private async readFile(filePath: string): Promise<Role | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as Role;
    } catch (err) {
      const e = err as NodeError;
      if (e.code === 'ENOENT') return null;
      logger.warn(`🔑 Failed to read role file ${filePath}: ${e.message}`);
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

export default FileRoleProvider;
