/**
 * KeyedSerial — one task at a time per key, within this process (#2015).
 *
 * A read-modify-write of one record (read the file, change it, write it back)
 * is only safe while nothing else writes that record in between. Two role
 * changes to one role used to interleave: each read the member list before the
 * other wrote it, and the second write dropped the first one's member. Running
 * every read-modify-write of a key through `run` makes them happen one after
 * another, each reading what the last one wrote. Different keys still run side
 * by side.
 *
 * What it does not do:
 *
 * - **Not across processes.** Two server processes sharing one data folder can
 *   still race; no supported deployment runs that way.
 * - **Not re-entrant.** A task must not `run` the same key again and wait for
 *   it: the inner task queues behind the outer one, which never finishes.
 *
 * A failed task fails its own caller only; the next task on the key runs as
 * usual. A key's entry is dropped once its queue is empty, so the map holds
 * only keys with work in flight.
 */
export class KeyedSerial {
  /** The settled tail of each key's queue: never rejects. */
  private readonly tails = new Map<string, Promise<void>>();

  /** Run `task` after every earlier task on `key` has settled; resolves or rejects as `task` does. */
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const before = this.tails.get(key) ?? Promise.resolve();
    const result = before.then(task);
    const tail = result.then(() => undefined, () => undefined);
    this.tails.set(key, tail);
    void tail.then(() => { if (this.tails.get(key) === tail) this.tails.delete(key); });
    return result;
  }

  /** Resolves once every task queued so far, on every key, has settled (shutdown). */
  async settled(): Promise<void> {
    await Promise.all([...this.tails.values()]);
  }
}

export default KeyedSerial;
