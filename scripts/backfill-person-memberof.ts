#!/usr/bin/env node
/**
 * Backfill `Person.memberOf` for existing Person records (#617 follow-up).
 *
 * For each Person file under `<FAST_STORAGE>/persons/<uuid>.json`, add
 * `memberOf: { "@id": <anchor-org-@id> }` if missing. Idempotent: skips
 * Persons that already have `memberOf`. The anchor org is resolved from
 * `<FAST_STORAGE>/config/app-custom-config.json` (key
 * `ngdpbase.application.organization.file`), then read from
 * `<FAST_STORAGE>/organizations/<filename>` to obtain its `@id`.
 *
 * Run once per install after pulling the UserManager person-sync wiring,
 * for any Person records that pre-date the wiring (e.g., produced by
 * scripts/migrate-users-to-persons.ts on an existing site).
 *
 *   FAST_STORAGE=/path/to/install/data npx tsx scripts/backfill-person-memberof.ts
 */
// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment and silently operates on ./data.
import '../src/bootstrap-env.js';
import { promises as fs } from 'fs';
import path from 'path';

interface Person {
  '@context': string;
  '@type': 'Person';
  '@id': string;
  identifier: string;
  memberOf?: unknown;
  [key: string]: unknown;
}

interface Organization {
  '@id': string;
  [key: string]: unknown;
}

function dataRoot(): string {
  return process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data';
}

function customConfigPath(): string {
  return path.join(dataRoot(), 'config', 'app-custom-config.json');
}

function personsDirPath(): string {
  return path.join(dataRoot(), 'persons');
}

function organizationsDirPath(): string {
  return path.join(dataRoot(), 'organizations');
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

async function resolveAnchorOrgId(): Promise<string> {
  const config = await readJson<Record<string, unknown>>(customConfigPath());
  const anchorFile = config['ngdpbase.application.organization.file'];
  if (typeof anchorFile !== 'string' || !anchorFile) {
    throw new Error(
      `'ngdpbase.application.organization.file' is not set in ${customConfigPath()}. ` +
      'Set it to the anchor org filename and rerun.'
    );
  }
  const orgPath = path.join(organizationsDirPath(), anchorFile);
  const org = await readJson<Organization>(orgPath);
  if (typeof org['@id'] !== 'string' || !org['@id']) {
    throw new Error(`Anchor org file ${orgPath} has no '@id'.`);
  }
  return org['@id'];
}

async function main(): Promise<void> {
  const personsDir = personsDirPath();
  const anchorId = await resolveAnchorOrgId();

  console.log(`persons/ : ${personsDir}`);
  console.log(`anchor   : ${anchorId}`);
  console.log('');

  let entries: string[];
  try {
    entries = await fs.readdir(personsDir);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      console.log('No persons directory; nothing to backfill.');
      return;
    }
    throw err;
  }

  let patched = 0;
  let skipped = 0;
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const filePath = path.join(personsDir, entry);
    let person: Person;
    try {
      person = await readJson<Person>(filePath);
    } catch {
      console.log(`  ! ${entry} (unreadable; skipped)`);
      continue;
    }
    if (person.memberOf) {
      console.log(`  = ${entry} (already linked)`);
      skipped++;
      continue;
    }
    person.memberOf = { '@id': anchorId };
    await writeAtomic(filePath, person);
    console.log(`  + ${entry} (memberOf added)`);
    patched++;
  }

  console.log('');
  console.log(`Done. Patched ${patched} Person record(s), skipped ${skipped} already-linked.`);
}

main().catch((err) => {
  console.error(`backfill-person-memberof failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
