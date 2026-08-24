#!/usr/bin/env node
/**
 * Strip the deprecated `roles` field from users.json (#617 iteration 3b).
 *
 * As of iteration 3b, RoleManager owns OrganizationRole records as the
 * single source of truth for role membership. The legacy `User.roles[]`
 * array on each user record is no longer read or written by UserManager.
 * This script removes the field from existing `users.json` entries.
 *
 * Run AFTER `scripts/backfill-roles-from-users.ts` has populated the
 * RoleManager records; running before that would lose the role-membership
 * data. Idempotent — re-runs are no-ops.
 *
 *   FAST_STORAGE=/path/to/install/data npx tsx scripts/strip-user-roles.ts
 */
// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment and silently operates on ./data.
import '../src/bootstrap-env.js';
import { promises as fs } from 'fs';
import path from 'path';

interface User {
  username?: string;
  roles?: unknown;
  [key: string]: unknown;
}

function dataRoot(): string {
  return process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data';
}

function usersFilePath(): string {
  return process.env.USERS_FILE || path.join(dataRoot(), 'users', 'users.json');
}

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as T;
}

async function writeAtomic(target: string, value: unknown): Promise<void> {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, target);
}

async function main(): Promise<void> {
  const usersFile = usersFilePath();
  console.log(`users.json: ${usersFile}`);
  console.log('');

  const parsed = await readJson<unknown>(usersFile);
  let stripped = 0;
  let unchanged = 0;

  if (Array.isArray(parsed)) {
    for (const user of parsed as User[]) {
      if (!user || typeof user.username !== 'string') continue;
      if ('roles' in user) {
        delete user.roles;
        console.log(`  - ${user.username} (roles removed)`);
        stripped++;
      } else {
        unchanged++;
      }
    }
    await writeAtomic(usersFile, parsed);
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, User>;
    for (const [username, user] of Object.entries(obj)) {
      if (!user || typeof user !== 'object') continue;
      if ('roles' in user) {
        delete user.roles;
        console.log(`  - ${username} (roles removed)`);
        stripped++;
      } else {
        unchanged++;
      }
    }
    await writeAtomic(usersFile, parsed);
  } else {
    throw new Error(`Unexpected users.json shape: ${typeof parsed}`);
  }

  console.log('');
  console.log(`Done. Stripped ${stripped} user(s); ${unchanged} already without roles.`);
}

main().catch((err) => {
  console.error(`strip-user-roles failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
