/**
 * @file scripts/reset-admin-password.ts
 * @description Recover an account whose password has been lost.
 *
 * Until this existed there was no recovery path at all: no forgot-password
 * route, no reset email, no script. The only options were another admin
 * resetting it (which needs a second admin to exist — usually there isn't
 * one), magic link (needs mail configured AND a real address on the account;
 * `admin` defaults to admin@localhost), or hand-computing a hash and pasting
 * it into users.json.
 *
 * That last one is what this automates, correctly: it hashes through the very
 * module the running app verifies with (#1042), so the value it writes is a
 * value the app accepts. Hand-computing is no longer even feasible — hashes
 * are salted per user and carry their own scrypt parameters.
 *
 * Usage:
 *   node dist/scripts/reset-admin-password.js <username> <new-password>
 *   node dist/scripts/reset-admin-password.js --list
 *
 * Run it from the instance directory, with the same environment the server
 * uses (FAST_STORAGE etc.) — `.env` is loaded automatically, exactly as the
 * app does it. Stop the server first: it holds users.json in memory and will
 * overwrite this on its next write.
 */

import '../src/bootstrap-env.js';

import path from 'path';
import { hashPassword } from '../src/utils/passwordHash.js';
import { promises as fs } from 'fs';

import ConfigurationManager from '../src/managers/ConfigurationManager.js';

interface StoredUser {
  username: string;
  password: string;
  email?: string;
  isSystem?: boolean;
  [key: string]: unknown;
}

function usage(): never {
  console.error('Usage: node dist/scripts/reset-admin-password.js <username> <new-password>');
  console.error('       node dist/scripts/reset-admin-password.js --list');
  process.exit(1);
}

async function main(): Promise<void> {
  const [target, newPassword] = process.argv.slice(2);
  if (!target) usage();
  const listOnly = target === '--list';
  if (!listOnly && !newPassword) usage();

  // ConfigurationManager alone, on a stub engine — the pattern used by the
  // other config-reading scripts. Booting the real engine would initialise
  // UserManager, which creates a bootstrap admin when one is missing: not
  // something a recovery tool should ever do as a side effect of being run.
  const configManager = new ConfigurationManager({ logger: console } as never);
  await configManager.initialize({});

  const usersDirectory = configManager.getResolvedDataPath(
    'ngdpbase.user.provider.storagedir',
    './data/users'
  );
  const usersFileName = configManager.getProperty(
    'ngdpbase.user.provider.files.users',
    'users.json'
  ) as string;
  const usersPath = path.join(usersDirectory, usersFileName);

  let raw: string;
  try {
    raw = await fs.readFile(usersPath, 'utf8');
  } catch {
    console.error(`Cannot read ${usersPath}`);
    console.error('Run this from the instance directory, with FAST_STORAGE set as the server sees it.');
    process.exit(1);
  }

  const users = JSON.parse(raw) as Record<string, StoredUser>;

  if (listOnly) {
    console.log(`Accounts in ${usersPath}:\n`);
    for (const [name, u] of Object.entries(users)) {
      const flags = [u.isSystem ? 'system' : null, u.profileLocked ? 'profile-locked' : null]
        .filter(Boolean)
        .join(', ');
      console.log(`  ${name.padEnd(20)} ${u.email ?? ''}${flags ? `  [${flags}]` : ''}`);
    }
    return;
  }

  if (!users[target]) {
    console.error(`No account named '${target}' in ${usersPath}`);
    console.error('Run with --list to see what is there.');
    process.exit(1);
  }

  // #1042: hash through the same module the running app uses, rather than
  // reimplementing the scheme here. This script used to inline
  // `sha256(password + configuredSalt)` — a duplicate that would have silently
  // written unverifiable hashes the moment the scheme changed, which is exactly
  // what #1042 did. One implementation, no drift.
  users[target].password = hashPassword(newPassword);

  // Write via a temp file so an interrupted run cannot leave users.json
  // truncated — losing every account is a far worse outcome than a failed
  // password reset.
  const tmpPath = `${usersPath}.reset-tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(users, null, 2), 'utf8');
  await fs.rename(tmpPath, usersPath);

  console.log(`✅ Password reset for '${target}' in ${usersPath}`);
  console.log('   Restart the server, then sign in with the new password.');
  console.log('   The server must have been STOPPED for this to stick — it holds');
  console.log('   users.json in memory and rewrites it on the next change.');
}

void main().catch((error: unknown) => {
  console.error('Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
