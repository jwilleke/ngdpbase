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

/** What one walk of the data folder did (#1695). */
export interface HandOver {
  /** Entries whose owner was changed to uid:gid. */
  changed: number;
  /** Entries that could not be changed, with why: a read-only mount, an owner-mapping filesystem. */
  failed: Array<{ path: string; code: string }>;
}

/**
 * Give every entry under `dir` (and `dir`) to uid:gid, without following links
 * (#1695). Visits the whole tree whatever happens: an entry that cannot be
 * changed (a read-only ConfigMap file mounted inside the folder, a file on a
 * filesystem that maps owners itself) is recorded and skipped, never the end
 * of the walk. Only entries not already uid:gid are changed, so a second
 * start after a finished hand-over only reads owners.
 */
export function handOverTree(dir: string, uid: number, gid: number, out: HandOver = { changed: 0, failed: [] }): HandOver {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(dir);
  } catch (err) {
    out.failed.push({ path: dir, code: (err as NodeJS.ErrnoException).code ?? (err as Error).message });
    return out;
  }
  if (st.uid !== uid || st.gid !== gid) {
    try {
      fs.lchownSync(dir, uid, gid);
      out.changed++;
    } catch (err) {
      out.failed.push({ path: dir, code: (err as NodeJS.ErrnoException).code ?? (err as Error).message });
    }
  }
  if (st.isDirectory()) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch (err) {
      out.failed.push({ path: dir, code: (err as NodeJS.ErrnoException).code ?? (err as Error).message });
    }
    for (const name of names) handOverTree(path.join(dir, name), uid, gid, out);
  }
  return out;
}

/** How many failed entries a note names before it says "and N more". */
const FAILED_SHOWN = 5;

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
    // #1695: the whole tree, every start as root. Deciding by the top folder
    // alone meant one interrupted hand-over (top folder already PUID:PGID,
    // everything below still root's) was never finished, and the server
    // crash-looped on the first file it could not read.
    const result = handOverTree(data, uid, gid);
    if (result.changed > 0) {
      notes.push(`🔐 Gave ${result.changed} entr${result.changed === 1 ? 'y' : 'ies'} under ${data} to ${uid}:${gid}, the configured run-as user (#1693)`);
    }
    if (result.failed.length > 0) {
      const shown = result.failed.slice(0, FAILED_SHOWN).map((f) => `${f.path} (${f.code})`).join(', ');
      const more = result.failed.length > FAILED_SHOWN ? `, and ${result.failed.length - FAILED_SHOWN} more` : '';
      notes.push(`⚠️  Could not give ${result.failed.length} entr${result.failed.length === 1 ? 'y' : 'ies'} under ${data} to ${uid}:${gid}: ${shown}${more}. ` +
        `Usually a read-only mount or a filesystem that maps owners itself; anything ${uid}:${gid} cannot read will fail later (#1695)`);
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
