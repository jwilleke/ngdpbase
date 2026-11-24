/**
 * #2467: the last-run line on the /admin dashboard (views/_job-last-run.ejs),
 * rendered as Express does, for the Media Management card's reindex lines.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { describe, expect, test } from 'vitest';

const VIEW = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../views/_job-last-run.ejs');

async function line(locals: Record<string, unknown>): Promise<string> {
  const html = await ejs.renderFile(VIEW, { jobId: 'media.reindex', ...locals });
  const body = new JSDOM(`<body>${html}</body>`).window.document.body;
  body.querySelectorAll('[hidden]').forEach((el) => el.remove());
  // What a person reads: no hidden parts, no space before a comma or semicolon.
  return body.textContent!.replace(/\s+/g, ' ').replace(/ ([,;])/g, '$1').trim();
}

const ran = { startedAt: '2026-11-19T09:00:00.000Z', completedAt: '2026-11-19T09:05:00.000Z', status: 'completed', ranBy: 'jim' };

describe('the reindex line', () => {
  test('a rebuild is named as the reason', async () => {
    const text = await line({ label: 'Last reindex', entry: { lastRun: ran, sinceStart: false, via: 'rebuild' } });
    expect(text).toBe('Last reindex: 2026-11-19 09:05 UTC by jim, completed (by rebuild)');
  });

  test('a reindex needs no reason', async () => {
    const text = await line({ label: 'Last reindex', entry: { lastRun: ran, sinceStart: false, via: null } });
    expect(text).toBe('Last reindex: 2026-11-19 09:05 UTC by jim, completed');
  });

  test('when neither has run it says nothing has run since the server started, not "never"', async () => {
    const text = await line({ label: 'Last reindex', emptyText: 'Not run since the server started', entry: { lastRun: null, sinceStart: false, via: null } });
    expect(text).toBe('Last reindex: Not run since the server started');
    expect(text).not.toMatch(/never/i);
  });
});

describe('the automatic reindex line', () => {
  test('shows when it last ran and when it runs next', async () => {
    const text = await line({
      jobId: 'media.folder-scan', label: 'Automatic reindex (every hour)', next: '2026-11-22T14:00:00.000Z',
      entry: { lastRun: { ...ran, ranBy: null }, sinceStart: false }
    });
    expect(text).toBe('Automatic reindex (every hour): 2026-11-19 09:05 UTC, completed; next run 2026-11-22 14:00 UTC');
  });

  test('before its first run it still shows the next one', async () => {
    const text = await line({
      jobId: 'media.folder-scan', label: 'Automatic reindex (every hour)', next: '2026-11-22T14:00:00.000Z', emptyText: 'Not run since the server started',
      entry: { lastRun: null, sinceStart: false }
    });
    expect(text).toBe('Automatic reindex (every hour): Not run since the server started; next run 2026-11-22 14:00 UTC');
  });

  test('with no next run there is no next-run text', async () => {
    const text = await line({ jobId: 'media.folder-scan', label: 'Automatic reindex (off)', next: null, entry: { lastRun: null, sinceStart: false }, emptyText: 'Not run since the server started' });
    expect(text).not.toContain('next run');
  });
});
