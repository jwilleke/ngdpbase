#!/usr/bin/env node
/**
 * Migrate users.json → Person JSON-LD records (#617 / Follow-up #4).
 *
 * For each user in `<FAST_STORAGE>/users/users.json`, write a Person
 * JSON-LD file at `<FAST_STORAGE>/persons/<uuid>.json` if one is not
 * already paired. Idempotent: re-running skips already-paired users
 * (matched by `Person.identifier === User.username`).
 *
 * This is a stop-gap until lazy Person migration is wired into
 * UserManager's JSON-LD emit paths. Run once per install when bringing
 * an existing site onto #617.
 *
 *   FAST_STORAGE=/path/to/install/data npx tsx scripts/migrate-users-to-persons.ts
 *   # or rely on the local .env / cwd
 */
// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment and silently operates on ./data.
import '../src/bootstrap-env.js';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

interface User {
  username: string;
  email?: string;
  displayName?: string;
}

interface Person {
  '@context': string;
  '@type': 'Person';
  '@id': string;
  identifier: string;
  name?: string;
  email?: string;
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

async function readUsersIndex(file: string): Promise<Record<string, User>> {
  const raw = await fs.readFile(file, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    const index: Record<string, User> = {};
    for (const u of parsed as User[]) {
      if (u && typeof u.username === 'string') index[u.username] = u;
    }
    return index;
  }
  return parsed as Record<string, User>;
}

async function readPairedIdentifiers(dir: string): Promise<Set<string>> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return new Set();
    throw err;
  }
  const paired = new Set<string>();
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, entry), 'utf8');
      const p = JSON.parse(raw) as Person;
      if (p && typeof p.identifier === 'string') paired.add(p.identifier);
    } catch {
      // skip malformed person files
    }
  }
  return paired;
}

function buildPerson(user: User): Person {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `urn:uuid:${crypto.randomUUID()}`,
    identifier: user.username,
    ...(user.displayName ? { name: user.displayName } : {}),
    ...(user.email ? { email: user.email } : {})
  };
}

async function writeAtomic(target: string, value: unknown): Promise<void> {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, target);
}

async function main(): Promise<void> {
  const usersFile = usersFilePath();
  const personsDir = personsDirPath();

  console.log(`users.json: ${usersFile}`);
  console.log(`persons/  : ${personsDir}`);
  console.log('');

  await fs.mkdir(personsDir, { recursive: true });

  const users = await readUsersIndex(usersFile);
  const usernames = Object.keys(users);
  const paired = await readPairedIdentifiers(personsDir);

  let created = 0;
  let skipped = 0;
  for (const username of usernames) {
    if (paired.has(username)) {
      console.log(`  = ${username} (already paired)`);
      skipped++;
      continue;
    }
    const person = buildPerson(users[username]);
    const uuid = person['@id'].slice('urn:uuid:'.length);
    await writeAtomic(path.join(personsDir, `${uuid}.json`), person);
    console.log(`  + ${username} → ${uuid}.json`);
    created++;
  }

  console.log('');
  console.log(`Done. Created ${created} Person record(s), skipped ${skipped} already-paired.`);
}

main().catch((err) => {
  console.error(`migrate-users-to-persons failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
