/**
 * Every mutating control in an admin template declares its permission (#1034).
 *
 * The first pass at #1034 enumerated controls by searching for `method="POST"`.
 * That missed six views whose forms are JS-driven — `addEventListener('submit')`
 * plus `fetch` — because they carry no method attribute at all. The operator
 * found one of them the same way as the original report: filled in the Edit
 * Organization form and got "Error updating organization: Admin access
 * required" after submitting.
 *
 * A hand-written list of views would drift the same way, so this walks the
 * templates instead: every `<button type="submit">` must carry
 * `lockedUnless(...)`, whatever mechanism its form submits by.
 */

import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const VIEWS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../views');

/**
 * Views whose submit buttons legitimately carry no gate, with the reason.
 * Anything else is a finding.
 */
const EXEMPT: Record<string, string> = {
  // Rendered by core but posting to the calendar addon's own API; the addon
  // owns that gate, and core should not assert a permission on its behalf.
  'admin-calendar.ejs': 'addon-owned endpoint (/api/calendar/*)',
  // Same: posts to /addons/journal/settings.
  'admin-journal.ejs': 'addon-owned endpoint (/addons/journal/*)'
};

function adminViews(): string[] {
  return readdirSync(VIEWS).filter((f) => f.startsWith('admin-') && f.endsWith('.ejs'));
}

/** Submit buttons, minus any that already declare a permission. */
function ungatedSubmitButtons(file: string): string[] {
  const html = readFileSync(path.join(VIEWS, file), 'utf8');
  return html
    .split('\n')
    .filter((line) => line.includes('type="submit"'))
    // Not a control: JS selecting the button, e.g. querySelector('button[type="submit"]')
    .filter((line) => line.includes('<button'))
    .filter((line) => !line.includes('lockedUnless'));
}

describe('admin templates gate their mutating controls (#1034)', () => {
  test('every submit button declares the permission it needs', () => {
    const findings: string[] = [];

    for (const file of adminViews()) {
      if (file in EXEMPT) continue;
      for (const line of ungatedSubmitButtons(file)) {
        findings.push(`${file}: ${line.trim().slice(0, 80)}`);
      }
    }

    expect(findings).toEqual([]);
  });

  test('the exemption list stays honest — every entry still exists and still has a submit button', () => {
    // Stops the list becoming a graveyard that silently excuses new views.
    for (const file of Object.keys(EXEMPT)) {
      expect(adminViews()).toContain(file);
      expect(readFileSync(path.join(VIEWS, file), 'utf8')).toContain('type="submit"');
    }
  });

  test('the walk actually finds buttons — guards against a vacuous pass', () => {
    // If the detection broke, every test above would pass by finding nothing.
    const gated = adminViews()
      .flatMap((f) => readFileSync(path.join(VIEWS, f), 'utf8').split('\n'))
      .filter((l) => l.includes('lockedUnless'));

    expect(gated.length).toBeGreaterThan(15);
  });
});
