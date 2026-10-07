/**
 * Where the server's single-instance lock lives (#1687).
 *
 * The lock stops a second server starting from the same checkout. It used to
 * be `<checkout>/.ngdpbase.pid`, which in the container image is `/app` —
 * owned by root, so a server run as any other user (the image's own `node`,
 * or the UID that owns an NFS data volume) could not start at all.
 *
 * It lives in the system temp directory instead, named per checkout, so it
 * protects exactly what it protected before: one server per checkout.
 * Writable by any user, and gone when a container is recreated — a lock on the
 * persistent data volume would outlive a crashed container, and since the
 * server is always PID 1 there, the next start would read it as alive.
 *
 * `server.sh` keeps its own `<checkout>/.ngdpbase.pid` for bare-metal starts;
 * the two never shared a purpose, only a name.
 */
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

/** The lock file for a server started from `checkout`. */
export function pidLockPath(checkout: string, tmpdir: string = os.tmpdir()): string {
  const id = createHash('sha256').update(path.resolve(checkout)).digest('hex').slice(0, 16);
  return path.join(tmpdir, `ngdpbase-${id}.pid`);
}
