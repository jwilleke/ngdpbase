/**
 * #1764 — "My tokens and devices": each row says plainly what it is and how it
 * is renewed (Fixed: ends on its date; Refreshable: renews itself), with its
 * end date or last renewal, and one Revoke form to AuthManager's door. Plain
 * words for the person, never the protocol's.
 *
 * Renders the real partial, as Express does.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import type { Delegation } from '../managers/AuthManager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PARTIAL = path.join(__dirname, '../../views/_delegations.ejs');

const row = (over: Partial<Delegation>): Delegation => ({
  kind: 'token', id: 'tok_1', name: 'import-script', device: false, renewal: 'fixed', scopes: ['page-read'],
  createdAt: '2026-10-12T08:00:00.000Z', expiresAt: '2026-10-12T20:00:00.000Z', renewedAt: null, lastUsedAt: null, ...over
});

async function render(items: Delegation[]): Promise<Document> {
  const html = await ejs.renderFile(PARTIAL, { items, csrfToken: 'csrf-value' });
  return new JSDOM(html).window.document;
}

const cells = (tr: Element): string[] => [...tr.querySelectorAll('td')].map(td => (td.textContent ?? '').replace(/\s+/g, ' ').trim());

describe('#1764 My tokens and devices list', () => {
  test('an empty list says so', async () => {
    const doc = await render([]);
    expect(doc.body.textContent).toMatch(/You have no tokens, apps or devices/);
  });

  test('each kind is labelled, with its end date or last renewal, and a Revoke to the one door', async () => {
    const doc = await render([
      row({}),
      row({ kind: 'app', id: 'g/1', name: 'Living Room TV', device: true, renewal: 'refreshable', expiresAt: null, renewedAt: '2026-10-11T08:00:00.000Z', scopes: ['openid', 'page-read'] }),
      row({ kind: 'app', id: 'g2', name: 'Notes app', renewal: 'fixed', expiresAt: '2026-10-15T09:00:00.000Z' })
    ]);
    const rows = [...doc.querySelectorAll('tbody tr')];
    expect(rows.map(r => r.getAttribute('data-delegation'))).toEqual(['token', 'app', 'app']);
    expect(cells(rows[0]).slice(0, 5)).toEqual(['import-script', 'Agent token', 'Fixed', 'page-read', 'Ends 2026-10-12 20:00 UTC Never used']);
    expect(cells(rows[1]).slice(0, 5)).toEqual(['Living Room TV', 'Device', 'Refreshable', 'openid, page-read', 'Last renewed 2026-10-11 08:00 UTC']);
    expect(cells(rows[2]).slice(0, 5)).toEqual(['Notes app', 'App', 'Fixed', 'page-read', 'Ends 2026-10-15 09:00 UTC']);
    const actions = [...doc.querySelectorAll('form')].map(f => f.getAttribute('action'));
    expect(actions).toEqual(['/profile/tokens/token/tok_1/revoke', '/profile/tokens/app/g%2F1/revoke', '/profile/tokens/app/g2/revoke']);
    expect(doc.querySelector('input[name="_csrf"]')?.getAttribute('value')).toBe('csrf-value');
  });

  test('a refreshable one not yet renewed says so; plain words, no protocol names', async () => {
    const doc = await render([row({ kind: 'app', name: 'Speaker', device: true, renewal: 'refreshable', renewedAt: null })]);
    expect(doc.body.textContent).toMatch(/Not renewed yet/);
    expect(doc.body.textContent).toMatch(/Ends 2026-10-12 20:00 UTC/);
    expect(doc.body.textContent).not.toMatch(/RFC|grant|OAuth|OIDC|refresh token/i);
  });
});
