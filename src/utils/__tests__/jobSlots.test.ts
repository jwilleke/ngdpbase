/**
 * selectSlots (#1715): which due slots run under each catch-up and overlap rule.
 */

import { selectSlots, CATCH_UP_ALL_CAP, type CatchUp, type Overlap } from '../jobSlots';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-10-09T12:00:30Z');
/** n hourly slots ending at 12:00, oldest first. */
const hourly = (n: number): Date[] => Array.from({ length: n }, (_, i) => new Date(Date.parse('2026-10-09T12:00:00Z') - (n - 1 - i) * HOUR));
const iso = (dates: Date[]): string[] => dates.map((d) => d.toISOString());

function pick(due: Date[], catchUp: CatchUp, overlap: Overlap = 'queue', busyUntil: Date | null = null) {
  return selectSlots({ due, now, busyUntil, onTimeMs: 60_000, catchUp, overlap });
}

describe('selectSlots (#1715)', () => {
  test('nothing due, nothing to do', () => {
    expect(pick([], 'all')).toEqual({ run: [], skip: [] });
  });

  test('one slot on time runs under every catch-up rule', () => {
    for (const mode of ['none', 'latest', 'all'] as const) {
      expect(iso(pick(hourly(1), mode).run)).toEqual(['2026-10-09T12:00:00.000Z']);
    }
  });

  describe('N missed slots (the server was down) give 0 / 1 / min(N, 12) runs', () => {
    // Every slot here came due more than a minute ago.
    const missed = (n: number): Date[] => hourly(n).map((d) => new Date(d.getTime() - HOUR));

    test('none: no run, every slot skipped', () => {
      const out = pick(missed(5), 'none');
      expect(out.run).toEqual([]);
      expect(out.skip).toHaveLength(5);
    });

    test('latest: only the newest runs', () => {
      const due = missed(5);
      const out = pick(due, 'latest');
      expect(out.run).toEqual([due[4]]);
      expect(out.skip).toEqual(due.slice(0, 4));
    });

    test('all: each runs, oldest first', () => {
      const due = missed(5);
      expect(pick(due, 'all')).toEqual({ run: due, skip: [] });
    });

    test(`all: capped at ${CATCH_UP_ALL_CAP}, the oldest beyond the cap skipped`, () => {
      const due = missed(20);
      const out = pick(due, 'all');
      expect(out.run).toEqual(due.slice(-CATCH_UP_ALL_CAP));
      expect(out.skip).toEqual(due.slice(0, 20 - CATCH_UP_ALL_CAP));
    });
  });

  test('none still runs the slot that is on time, and skips the missed ones', () => {
    const due = hourly(3);
    const out = pick(due, 'none');
    expect(out.run).toEqual([due[2]]);
    expect(out.skip).toEqual(due.slice(0, 2));
  });

  describe('slots that came due while the job was running', () => {
    const busyUntil = new Date('2026-10-09T12:00:10Z');

    test('queue: one waits, the newest; the rest are skipped', () => {
      const due = hourly(3);
      const out = pick(due, 'none', 'queue', busyUntil);
      expect(out.run).toEqual([due[2]]);
      expect(out.skip).toEqual(due.slice(0, 2));
    });

    test('skip: none runs', () => {
      const due = hourly(3);
      const out = pick(due, 'all', 'skip', busyUntil);
      expect(out.run).toEqual([]);
      expect(out.skip).toEqual(due);
    });

    test('a slot that came due after the run ended follows the catch-up rule', () => {
      const due = [new Date('2026-10-09T11:59:00Z'), new Date('2026-10-09T12:00:20Z')];
      const out = pick(due, 'none', 'skip', busyUntil);
      expect(out.run).toEqual([due[1]]);
      expect(out.skip).toEqual([due[0]]);
    });
  });
});
