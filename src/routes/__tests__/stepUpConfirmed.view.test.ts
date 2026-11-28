/**
 * #2145, #2360 — the note a page shows once it is back from "Confirm it is you" for an action
 * that could not be redone. Every action says it can be done now; Reset configuration, which
 * must be pressed again, says so. The wording comes from a fixed key, never from the request.
 */
import ejs from 'ejs';
import path from 'path';

const VIEW = path.resolve(process.cwd(), 'views/_step-up-confirmed.ejs');
const render = (locals: Record<string, unknown>): Promise<string> => ejs.renderFile(VIEW, locals) as Promise<string>;

describe('the "Confirmed" note (#2360)', () => {
  test('the generic note says it can be done now', async () => {
    const html = await render({});
    expect(html).toContain('data-step-up-confirmed');
    expect(html).toContain('Confirmed — you can do it now.');
    expect(html).not.toContain('press Reset again');
  });

  test('the Reset configuration note says to press Reset again', async () => {
    const html = await render({ stepUpNote: 'press-again' });
    expect(html).toContain('data-step-up-confirmed');
    expect(html).toContain('Confirmed, press Reset again');
    expect(html).not.toContain('you can do it now');
  });

  test('any other key, or text, falls back to the generic note and is never printed', async () => {
    const html = await render({ stepUpNote: '<script>alert(1)</script>' });
    expect(html).toContain('Confirmed — you can do it now.');
    expect(html).not.toContain('alert(1)');
  });
});
