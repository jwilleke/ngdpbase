/**
 * Which due slots of a scheduled job run, and which are skipped (#1715, epic
 * #1611). Pure: the scheduler in `BackgroundJobManager` hands it the slots
 * that are due and when the job was last busy, and records what it returns.
 *
 * A slot is due when its time has come and it has not been handled. Due slots
 * come in two kinds, and each has its own rule:
 *
 *   - **came due while the job was running** (before `busyUntil`): the job's
 *     `overlap` rule. `queue` keeps one waiting slot, the newest; `skip` keeps
 *     none. One job never runs twice at once.
 *   - **came due while the job was idle, or the server was down**: the job's
 *     `catchUp` rule. A slot that came due within `onTimeMs` is on time, not
 *     missed: `none` runs only on-time slots, `latest` runs the newest due slot,
 *     `all` runs the newest {@link CATCH_UP_ALL_CAP}, oldest first.
 *
 * Every due slot not run is skipped, so the caller records it: a slot is
 * never dropped without a trace (operator, 2026-10-08).
 *
 * @module utils/jobSlots
 */

export type CatchUp = 'none' | 'latest' | 'all';
export type Overlap = 'queue' | 'skip';

/** `catchUp: 'all'` runs at most this many missed slots; older ones are skipped. */
export const CATCH_UP_ALL_CAP = 12;

export interface SlotSelectionInput {
  /** The due slots, oldest first. */
  due: Date[];
  now: Date;
  /** When this job's last run in this process ended; null when it has not run since start. */
  busyUntil: Date | null;
  /** A slot that came due at most this long ago is on time, not missed. */
  onTimeMs: number;
  catchUp: CatchUp;
  overlap: Overlap;
}

export interface SlotSelection {
  /** Slots to run, oldest first, one at a time. */
  run: Date[];
  /** Slots passed over, oldest first. */
  skip: Date[];
}

export function selectSlots(input: SlotSelectionInput): SlotSelection {
  const { due, now, busyUntil, onTimeMs, catchUp, overlap } = input;
  const whileBusy = busyUntil ? due.filter((slot) => slot.getTime() < busyUntil.getTime()) : [];
  const whileIdle = due.filter((slot) => !whileBusy.includes(slot));

  const chosen = new Set<Date>();
  if (overlap === 'queue' && whileBusy.length > 0) chosen.add(whileBusy[whileBusy.length - 1]);

  if (catchUp === 'none') {
    for (const slot of whileIdle) if (now.getTime() - slot.getTime() <= onTimeMs) chosen.add(slot);
  } else if (catchUp === 'latest') {
    if (whileIdle.length > 0) chosen.add(whileIdle[whileIdle.length - 1]);
  } else {
    for (const slot of whileIdle.slice(-CATCH_UP_ALL_CAP)) chosen.add(slot);
  }

  return {
    run: due.filter((slot) => chosen.has(slot)),
    skip: due.filter((slot) => !chosen.has(slot))
  };
}
