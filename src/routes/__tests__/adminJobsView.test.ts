/**
 * #1718 — views/admin-jobs.ejs with jobs in every state. Core registers no
 * scheduled job yet, so the E2E check only sees the empty page; this renders
 * the cards. Header and footer are left out: they are not this view's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const VIEW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../views/admin-jobs.ejs');

const base = {
  displayName: 'Month close', schedule: 'end-of-month 06:00', rrule: 'FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=6;BYMINUTE=0',
  timeZone: 'UTC', catchUp: 'latest', overlap: 'queue', maxAttempts: 3, persist: true, enabled: true, running: false,
  nextSlot: '2026-10-31T06:00:00.000Z', lastSlotDone: '2026-09-30T06:00:00.000Z', current: null, runs: [] as unknown[]
};

/** The view without its header and footer includes, which need the whole page's data. */
const TEMPLATE = fs.readFileSync(VIEW, 'utf8').replace(/<%- include\('(header|footer)'[^%]*%>/g, '');

function render(jobs: unknown[], held: string[] = ['admin-system', 'config-manage']): string {
  return ejs.render(TEMPLATE, {
    jobs, success: null, error: null, csrfToken: 'tok',
    lockedUnless: (p: string) => (held.includes(p) ? '' : ' disabled aria-disabled="true"')
  });
}

describe('admin-jobs view (#1718)', () => {
  test('no jobs: says so', () => {
    expect(render([])).toContain('No scheduled jobs are registered');
  });

  test('a job with a skipped and a finally failed slot offers to run each again, and not a completed one', () => {
    const html = render([{
      ...base, id: 'acct.close',
      runs: [
        { runId: 'a', slot: '2026-09-30T06:00:00.000Z', status: 'completed', attempt: 1, startedAt: 'x' },
        { runId: 'b', slot: '2026-08-31T06:00:00.000Z', status: 'skipped', attempt: 0, startedAt: 'x' },
        { runId: 'c', slot: '2026-07-31T06:00:00.000Z', status: 'failed', attempt: 3, startedAt: 'x', error: 'ledger locked (attempt 3 of 3; not tried again)' },
        { runId: 'd', slot: null, status: 'completed', attempt: 1, startedAt: 'x' }
      ]
    }]);
    expect(html.match(/name="slot" value="([^"]+)"/g)).toEqual([
      'name="slot" value="2026-08-31T06:00:00.000Z"',
      'name="slot" value="2026-07-31T06:00:00.000Z"'
    ]);
    expect(html).toContain('Run now</td>');
    expect(html).toContain('action="/admin/jobs/acct.close/run-now"');
    expect(html).toContain('name="_csrf" value="tok"');
  });

  test('a run waiting for its retry shows when, offers Retry now, and Run now is disabled', () => {
    const html = render([{ ...base, id: 'acct.close', current: { runId: 'r', slot: 's', status: 'failed', attempt: 1, startedAt: 'x', retryAt: '2026-10-31T06:06:00.000Z' } }]);
    expect(html).toContain('Retry 2 of 3 at 2026-10-31T06:06:00.000Z');
    expect(html).toContain('action="/admin/jobs/acct.close/retry"');
    expect(html).toMatch(/btn-outline-primary"\s*disabled>.*Run now/);
  });

  test('a paused job offers Resume', () => {
    const html = render([{ ...base, id: 'acct.close', enabled: false }]);
    expect(html).toContain('Paused');
    expect(html).toContain('name="paused" value="false"');
    expect(html).toContain('Resume');
  });

  test('without the permissions, the buttons are locked', () => {
    const html = render([{ ...base, id: 'acct.close' }], []);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
  });
});
