/**
 * The closure page names the reason that closed the instance (#1432).
 *
 * One gate refuses traffic for several reasons — maintenance, a schedule such
 * as business hours, a holiday, a misconfiguration, a cold start — and they all
 * render this page. Its heading was the literal string "We are currently
 * performing maintenance", so a holiday closure announced itself as
 * maintenance, and an instance that could not boot told the operator it was
 * being worked on.
 *
 * The gate already passed `reason` for exactly this ("so the page can say so
 * and a test can tell a schedule from a holiday") and the template dropped it.
 * These render the real template, because the defect is branch selection in the
 * view — the kind that asserting on source would miss.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEW = path.join(__dirname, '../../views/maintenance.ejs');

/** Render the page the way both gates in `app.ts` render it. */
async function render(locals: Record<string, unknown> = {}): Promise<string> {
  return ejs.renderFile(VIEW, {
    message: 'Configured wording for this reason.',
    estimatedDuration: null,
    notifications: [],
    allowAdmins: false,
    isAdmin: false,
    ...locals
  }, { async: true });
}

describe('#1432 the closure page names its reason', () => {
  test('maintenance still reads as maintenance', async () => {
    const html = await render({ reason: 'maintenance' });
    expect(html).toContain('We are currently performing maintenance');
    expect(html).toContain('data-closure-reason="maintenance"');
  });

  test('a schedule does not claim to be maintenance', async () => {
    const html = await render({ reason: 'schedule' });
    expect(html).toContain('The site is closed right now');
    expect(html).not.toContain('performing maintenance');
  });

  test('a holiday does not claim to be maintenance', async () => {
    const html = await render({ reason: 'holiday' });
    expect(html).toContain('The site is closed for a holiday');
    expect(html).not.toContain('performing maintenance');
  });

  test('a misconfigured instance is not described as planned work', async () => {
    // This one reaches the operator when the engine refuses to boot. Telling
    // them maintenance is in progress sends them looking for the wrong thing.
    const html = await render({ reason: 'misconfigured' });
    expect(html).toContain('The site is temporarily unavailable');
    expect(html).not.toContain('performing maintenance');
  });

  test('a cold start says it is starting, not that someone is working on it', async () => {
    const html = await render({ reason: 'starting' });
    expect(html).toContain('The site is starting up');
    expect(html).not.toContain('performing maintenance');
  });

  test('the operator wording is always shown, whatever the reason', async () => {
    // The heading names the reason; the message is the operator's own text for
    // it, and it must never be swallowed by the branch.
    for (const reason of ['maintenance', 'schedule', 'holiday', 'misconfigured', 'starting']) {
      const html = await render({ reason });
      expect(html).toContain('Configured wording for this reason.');
    }
  });

  test('a caller that passes no reason still renders, as maintenance', async () => {
    // Defensive: the template is reachable from any render site, and an
    // undefined local must not throw a ReferenceError on an error page.
    const html = await render();
    expect(html).toContain('We are currently performing maintenance');
    expect(html).toContain('data-closure-reason="maintenance"');
  });

  test('an unknown reason falls back rather than rendering an empty heading', async () => {
    const html = await render({ reason: 'something-an-addon-invented' });
    expect(html).toContain('We are currently performing maintenance');
  });
});
