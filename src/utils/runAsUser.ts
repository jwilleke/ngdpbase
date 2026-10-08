/**
 * The user the server runs as is a setting: PUID / PGID (#1693).
 *
 * Operator decision (2026-10-08): both are REQUIRED — the server refuses to
 * start without them, and it never runs as root. The standard default,
 * 1000:1000, ships in `.env.example`, the Compose file and the Kubernetes
 * example, so following the docs gives a non-root user and removing the lines
 * gives a refusal rather than root.
 *
 * One mechanism for every deployment, run by `bootstrap-env.ts` straight after
 * it loads the environment and the `.env` files, before anything is written:
 *
 * - Started as root (a plain `docker run`, a pod without `runAsUser`): make
 *   the instance data folder (`FAST_STORAGE`) belong to PUID:PGID if it does
 *   not already, then switch the process to that user and group. This is the
 *   LinuxServer.io pattern, done in the app so it is the same everywhere.
 * - Already non-root (Compose `user:`, Kubernetes `runAsUser`, bare metal): it
 *   cannot switch, so it must already BE PUID:PGID, or it refuses and says
 *   what to set.
 *
 * `SLOW_STORAGE` is never re-owned — it can be a NAS holding tens of thousands
 * of files — only checked, after the switch, for being writable.
 *
 * On a platform with no user ids (Windows) none of this applies.
 */
import fs from 'node:fs';
import path from 'node:path';

/** What the run-as step needs from the process; the real one in production, a stand-in in tests. */
export interface ProcessIds {
  getuid(): number;
  getgid(): number;
  setuid(id: number): void;
  setgid(id: number): void;
  setgroups?(groups: number[]): void;
}

export interface RunAsResult {
  uid: number;
  gid: number;
  /** Lines worth logging: a switch, a re-owned folder, an ownership change that could not be made. */
  notes: string[];
}

const HOW_TO_SET = 'Set PUID and PGID (in .env, or the container\'s environment) to the user the server runs as — the standard default is PUID=1000 and PGID=1000 (#1693).';

/** Parse one id variable: a whole number, never 0 (root). */
function idFrom(env: NodeJS.ProcessEnv, name: 'PUID' | 'PGID'): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`Refusing to start: ${name} is not set. ${HOW_TO_SET}`);
  }
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`Refusing to start: ${name}='${raw}' is not a numeric id. ${HOW_TO_SET}`);
  }
  const id = Number(raw.trim());
  if (id === 0) {
    throw new Error(`Refusing to start: ${name}=0 is root, and ngdpbase never runs as root. ${HOW_TO_SET}`);
  }
  return id;
}

/** Give every entry under `dir` (and `dir`) to uid:gid, without following links. Returns the first failure, if any. */
function chownTree(dir: string, uid: number, gid: number): Error | null {
  try {
    fs.lchownSync(dir, uid, gid);
    const st = fs.lstatSync(dir);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(dir)) {
        const err = chownTree(path.join(dir, name), uid, gid);
        if (err) return err;
      }
    }
    return null;
  } catch (err) {
    return err as Error;
  }
}

/**
 * Become the configured run-as user, or refuse (#1693).
 *
 * @param env       - the environment, after the `.env` files are applied
 * @param dataDir   - the instance data folder (FAST_STORAGE), re-owned when started as root
 * @param slowDir   - SLOW_STORAGE, checked for writability after the switch when it exists
 * @param ids       - the process's id calls (defaults to the real process)
 * @throws when PUID/PGID are missing or invalid, when a non-root process is not
 *   PUID:PGID, or when SLOW_STORAGE is not writable as that user
 */
export function becomeRunAsUser(
  env: NodeJS.ProcessEnv,
  dataDir: string,
  slowDir: string | undefined,
  ids: ProcessIds | null = typeof process.getuid === 'function' ? (process as unknown as ProcessIds) : null
): RunAsResult | null {
  if (!ids) return null; // no user ids on this platform
  const uid = idFrom(env, 'PUID');
  const gid = idFrom(env, 'PGID');
  const notes: string[] = [];

  if (ids.getuid() === 0) {
    const data = path.resolve(dataDir);
    fs.mkdirSync(data, { recursive: true });
    const st = fs.statSync(data);
    if (st.uid !== uid || st.gid !== gid) {
      const err = chownTree(data, uid, gid);
      notes.push(err
        ? `⚠️  Could not give ${data} to ${uid}:${gid} (${err.message}); its filesystem may map owners itself (NFS). Continuing as ${uid}:${gid} (#1693)`
        : `🔐 Gave ${data} to ${uid}:${gid}, the configured run-as user (#1693)`);
    }
    ids.setgroups?.([gid]);
    ids.setgid(gid);
    ids.setuid(uid);
    notes.push(`👤 Running as ${uid}:${gid} (PUID/PGID), switched from root (#1693)`);
  } else if (ids.getuid() !== uid || ids.getgid() !== gid) {
    throw new Error(
      `Refusing to start: running as ${ids.getuid()}:${ids.getgid()}, but PUID/PGID say ${uid}:${gid}. ` +
      `Start the server as ${uid}:${gid}, or set PUID=${ids.getuid()} and PGID=${ids.getgid()} (#1693).`
    );
  }

  if (slowDir) {
    const slow = path.resolve(slowDir);
    if (fs.existsSync(slow)) {
      try {
        fs.accessSync(slow, fs.constants.W_OK);
      } catch {
        throw new Error(`Refusing to start: ${slow} (SLOW_STORAGE) is not writable as ${uid}:${gid}. Give it to that user, or set PUID/PGID to its owner (#1693).`);
      }
    }
  }
  return { uid, gid, notes };
}
