/**
 * @file src/bootstrap-env.ts
 * @description Loads `.env` into process.env before anything else runs.
 *
 * MUST be the first import in the entry point. ES module imports are hoisted
 * and evaluated in order, so a side-effecting module imported first is the
 * only reliable way to populate the environment ahead of every other module's
 * top-level code. Calling `dotenv.config()` inline in app.ts would run AFTER
 * all of its imports had already been evaluated.
 *
 * Why this exists: `server.sh` sources .env with `set -a`, so direct installs
 * have always had it. Containers never did — the image runs
 * `node dist/src/app.js` directly and server.sh is not even COPYed in — so a
 * .env on the data volume was silently inert. Env-ref config values such as
 * `"$NGDPBASE_ADMIN_PASSWORD"` could then only be satisfied by a Secret plus
 * an `env:` block in the deployment manifest: the wrong home for application
 * configuration, and a GitOps change to alter. Now `.env` behaves the same
 * however the process is launched.
 *
 * Precedence, highest first:
 *
 *   1. The ambient environment      — Kubernetes `env:`, `PORT=x node …`
 *   2. `<FAST_STORAGE>/.env`        — per-instance, lives on the data volume
 *   3. `<cwd>/.env`                 — repo root
 *
 * The ambient environment wins so that an explicitly-set variable is never
 * silently overridden by a file. This is not a divergence from `server.sh` in
 * practice: it sources both files into the environment *before* node starts,
 * so by the time this runs the ambient values already carry them and there is
 * nothing to conflict with.
 *
 * The per-instance file is applied before the root one so it takes precedence
 * between the two, matching `server.sh`'s sourcing order. Its location can
 * itself be defined in the root file, so that file is parsed (not applied)
 * first purely to discover FAST_STORAGE.
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const rootEnvPath = path.join(process.cwd(), '.env');

/**
 * Where the per-instance .env lives. FAST_STORAGE may be set ambiently or
 * declared in the root .env, so peek at that file without applying it.
 */
function resolveInstanceDataDir(): string {
  if (process.env.FAST_STORAGE) return process.env.FAST_STORAGE;
  if (process.env.INSTANCE_DATA_FOLDER) return process.env.INSTANCE_DATA_FOLDER;

  try {
    const parsed = dotenv.parse(fs.readFileSync(rootEnvPath));
    return parsed.FAST_STORAGE || parsed.INSTANCE_DATA_FOLDER || './data';
  } catch {
    return './data';
  }
}

// Per-instance first so it beats the root file; neither overrides the
// ambient environment.
dotenv.config({
  path: path.join(resolveInstanceDataDir(), '.env'),
  quiet: true
});

dotenv.config({ path: rootEnvPath, quiet: true });
