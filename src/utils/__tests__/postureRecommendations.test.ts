import fs from 'fs';
import path from 'path';

/**
 * #1146 — the recommendation page is advice an operator can actually follow.
 *
 * A page naming a key that does not exist is advice nobody can act on, and it
 * is the same failure as a posture listing a key nothing reads (#1118's class):
 * something declared, with nothing behind it.
 */
const PAGE = path.join(process.cwd(), 'required-pages', '6bcfabac-9646-4a1c-b6e5-855429d72df3.md');

describe('#1146 — the security posture recommendations', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  const config = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')
  ) as Record<string, unknown>;

  /** Every `ngdpbase.*` key the page names in a code span. */
  const named = [...page.matchAll(/`(ngdpbase\.[a-z0-9.-]+)`/g)].map((m) => m[1]);

  test('names a meaningful number of keys', () => {
    // Guards the extraction itself: a regex that silently matched nothing
    // would make every assertion below pass for the wrong reason.
    expect(named.length).toBeGreaterThan(10);
  });

  test('every key it names actually exists', () => {
    const missing = [...new Set(named)].filter((k) => !(k in config));
    expect(missing).toEqual([]);
  });

  test('it never names a secret key', () => {
    // Telling an operator to set a credential on a page anyone with page-read
    // can open is not advice worth giving.
    const secrets = new Set(config['ngdpbase.config.secret-keys'] as string[]);
    expect([...new Set(named)].filter((k) => secrets.has(k))).toEqual([]);
  });

  test('it carries the accountability disclaimer', () => {
    // D17: this is D2 made visible in the product, not boilerplate. A page
    // headed "hardened" reads as an instruction without it.
    expect(page).toMatch(/You alone are accountable and responsible/);
  });

  test('it uses the application-name builtin rather than a hardcoded name', () => {
    expect(page).toContain('[{$applicationname}]');
  });

  test('it does not use the forbidden term', () => {
    expect(page.toLowerCase()).not.toContain('wiki');
  });

  test('it says why there is no score', () => {
    // D20. Without this the absence reads as an omission rather than a
    // decision, and somebody adds one later.
    expect(page).toMatch(/no score/i);
  });
});
