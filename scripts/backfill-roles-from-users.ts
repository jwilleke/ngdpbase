#!/usr/bin/env node
/**
 * Backfill OrganizationRole records from existing User.roles[] (#617
 * follow-up, iteration 2).
 *
 * Reads `<FAST_STORAGE>/users/users.json`, pairs usernames with their
 * Person `@id`s under `<FAST_STORAGE>/persons/`, groups by role, and
 * writes one OrganizationRole record per (anchor-org, role) under
 * `<FAST_STORAGE>/roles/<namedPosition>.json`. Idempotent: re-running
 * merges into existing files without dropping unrelated members and
 * skips users that have no paired Person record.
 *
 * Run once per install after pulling the iteration-2 UserManager wiring,
 * for any role assignments that pre-date the mirror.
 *
 *   FAST_STORAGE=/path/to/install/data npx tsx scripts/backfill-roles-from-users.ts
 */
// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment and silently operates on ./data.
import '../src/bootstrap-env.js';
import { promises as fs } from 'fs';
import path from 'path';

interface User {
  username: string;
  roles?: string[];
}

interface Person {
  '@id': string;
  identifier?: string;
}

interface Organization {
  '@id': string;
  url?: string;
  [key: string]: unknown;
}

interface RoleCatalogEntry {
  name?: string;
  displayname?: string;
  description?: string;
  issystem?: boolean;
  icon?: string;
  color?: string;
  permissions?: string[];
}

interface PropertyValue {
  '@type': 'PropertyValue';
  name: string;
  value: unknown;
}

interface OrganizationRole {
  '@context': 'https://schema.org';
  '@type': 'OrganizationRole';
  '@id': string;
  namedPosition: string;
  organization: { '@id': string };
  member?: { '@id': string }[];
  roleName?: string;
  description?: string;
  issystem?: boolean;
  icon?: string;
  color?: string;
  additionalProperty?: PropertyValue[];
  [key: string]: unknown;
}

function dataRoot(): string {
  return process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data';
}

function usersFilePath(): string {
  return process.env.USERS_FILE || path.join(dataRoot(), 'users', 'users.json');
}

function personsDirPath(): string {
  return process.env.PERSONS_DIR || path.join(dataRoot(), 'persons');
}

function rolesDirPath(): string {
  return process.env.ROLES_DIR || path.join(dataRoot(), 'roles');
}

function customConfigPath(): string {
  return path.join(dataRoot(), 'config', 'app-custom-config.json');
}

function defaultConfigPath(): string {
  // Run from repo root: `npx tsx scripts/backfill-roles-from-users.ts`.
  return process.env.DEFAULT_CONFIG || path.join(process.cwd(), 'config', 'app-default-config.json');
}

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as T;
}

async function readJsonOptional<T>(file: string): Promise<T | null> {
  try {
    return await readJson<T>(file);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeAtomic(target: string, value: unknown): Promise<void> {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, target);
}

async function readUsersIndex(file: string): Promise<Record<string, User>> {
  const parsed = await readJson<unknown>(file);
  if (Array.isArray(parsed)) {
    const index: Record<string, User> = {};
    for (const u of parsed as User[]) {
      if (u && typeof u.username === 'string') index[u.username] = u;
    }
    return index;
  }
  return parsed as Record<string, User>;
}

async function readPersonByIdentifier(dir: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return map;
    throw err;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const p = await readJson<Person>(path.join(dir, entry));
      if (p && typeof p.identifier === 'string' && typeof p['@id'] === 'string') {
        map.set(p.identifier, p['@id']);
      }
    } catch {
      // skip malformed
    }
  }
  return map;
}

async function resolveAnchorOrg(): Promise<Organization> {
  const config = await readJson<Record<string, unknown>>(customConfigPath());
  const anchorFile = config['ngdpbase.application.organization.file'];
  if (typeof anchorFile !== 'string' || !anchorFile) {
    throw new Error(
      `'ngdpbase.application.organization.file' is not set in ${customConfigPath()}. ` +
      'Set it to the anchor org filename and rerun.'
    );
  }
  const orgsDir = path.join(dataRoot(), 'organizations');
  const orgPath = path.join(orgsDir, anchorFile);
  const org = await readJson<Organization>(orgPath);
  if (typeof org['@id'] !== 'string' || !org['@id']) {
    throw new Error(`Anchor org file ${orgPath} has no '@id'.`);
  }
  return org;
}

async function loadRoleCatalog(): Promise<Record<string, RoleCatalogEntry>> {
  const defaults = await readJsonOptional<Record<string, unknown>>(defaultConfigPath());
  const custom = await readJsonOptional<Record<string, unknown>>(customConfigPath());
  const defs = (defaults?.['ngdpbase.roles.definitions'] ?? {}) as Record<string, RoleCatalogEntry>;
  const overrides = (custom?.['ngdpbase.roles.definitions'] ?? {}) as Record<string, RoleCatalogEntry>;
  return { ...defs, ...overrides };
}

function buildSnapshot(def: RoleCatalogEntry | undefined): Partial<OrganizationRole> {
  const out: Partial<OrganizationRole> = {};
  if (!def) return out;
  const label = def.displayname ?? def.name;
  if (label) out.roleName = label;
  if (def.description) out.description = def.description;
  if (def.issystem !== undefined) out.issystem = def.issystem;
  if (def.icon) out.icon = def.icon;
  if (def.color) out.color = def.color;
  if (def.permissions) {
    out.additionalProperty = [
      { '@type': 'PropertyValue', name: 'permissions', value: def.permissions }
    ];
  }
  return out;
}

function buildRoleId(org: Organization, namedPosition: string): string {
  const base = (org.url || org['@id']);
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}roles/${namedPosition}#role`;
}

async function main(): Promise<void> {
  const usersFile = usersFilePath();
  const personsDir = personsDirPath();
  const rolesDir = rolesDirPath();

  console.log(`users.json: ${usersFile}`);
  console.log(`persons/  : ${personsDir}`);
  console.log(`roles/    : ${rolesDir}`);

  const anchorOrg = await resolveAnchorOrg();
  console.log(`anchor    : ${anchorOrg['@id']}`);
  console.log('');

  await fs.mkdir(rolesDir, { recursive: true });

  const users = await readUsersIndex(usersFile);
  const personByUsername = await readPersonByIdentifier(personsDir);
  const catalog = await loadRoleCatalog();

  const roleToMemberIds = new Map<string, Set<string>>();
  let pairedUsers = 0;
  let unpairedUsers = 0;
  for (const [username, user] of Object.entries(users)) {
    const personId = personByUsername.get(username);
    if (!personId) {
      unpairedUsers++;
      console.log(`  ! ${username} (no paired Person; skipping)`);
      continue;
    }
    pairedUsers++;
    const roles = Array.isArray(user.roles) ? user.roles : [];
    for (const roleName of roles) {
      if (!roleToMemberIds.has(roleName)) roleToMemberIds.set(roleName, new Set());
      roleToMemberIds.get(roleName).add(personId);
    }
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const [roleName, memberIds] of roleToMemberIds) {
    const target = path.join(rolesDir, `${roleName}.json`);
    const existing = await readJsonOptional<OrganizationRole>(target);

    if (!existing) {
      const role: OrganizationRole = {
        '@context': 'https://schema.org',
        '@type': 'OrganizationRole',
        '@id': buildRoleId(anchorOrg, roleName),
        namedPosition: roleName,
        organization: { '@id': anchorOrg['@id'] },
        member: Array.from(memberIds, (id) => ({ '@id': id })),
        ...buildSnapshot(catalog[roleName])
      };
      await writeAtomic(target, role);
      console.log(`  + ${roleName}.json (${memberIds.size} member(s))`);
      created++;
      continue;
    }

    const existingMembers = Array.isArray(existing.member) ? existing.member : [];
    const beforeIds = new Set(existingMembers.map((m) => m['@id']));
    const after = new Set(beforeIds);
    for (const id of memberIds) after.add(id);
    if (after.size === beforeIds.size) {
      console.log(`  = ${roleName}.json (already current; ${beforeIds.size} member(s))`);
      unchanged++;
      continue;
    }
    const merged: OrganizationRole = {
      ...existing,
      member: Array.from(after, (id) => ({ '@id': id }))
    };
    await writeAtomic(target, merged);
    console.log(`  ~ ${roleName}.json (${beforeIds.size} → ${after.size} member(s))`);
    updated++;
  }

  console.log('');
  console.log(
    `Done. Paired ${pairedUsers} user(s) (${unpairedUsers} unpaired); ` +
    `${created} role file(s) created, ${updated} updated, ${unchanged} unchanged.`
  );
}

main().catch((err) => {
  console.error(`backfill-roles-from-users failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
