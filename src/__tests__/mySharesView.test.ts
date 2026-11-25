/**
 * views/my-shares.ejs, rendered as Express renders it (slice 3 of #2247).
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');

const COMMON = {
  title: 'Shared links', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`,
  lockedUnless: () => '', currentUser: { username: 'molly', displayName: 'Molly', roles: [] as string[], isAuthenticated: true }
};
const ROW = { id: 'r1', kind: 'tag', what: 'Everything tagged Garden', status: 'active', expiresAt: null, createdAt: '2026-11-01T00:00:00.000Z', actions: ['revoke'] };

async function render(locals: Record<string, unknown>): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, 'my-shares.ejs'), {
    ...COMMON, rows: [], mayTag: true, mayVault: true, vaults: [], pickVault: null, pickPages: [], preselected: null,
    baseUrl: 'https://wiki.example.com', notice: null, shareChoice: '', tagPrefill: '', pagePrefill: '', createdId: '',
    revoked: false, error: null, addresses: {}, ...locals
  });
  return new JSDOM(html).window.document;
}

describe('my-shares.ejs addresses (round 3 H1)', () => {
  test('an active tag link shows its full address and a Copy button', async () => {
    const doc = await render({ rows: [ROW], addresses: { r1: 'https://wiki.example.com/share/abc' }, createdId: 'r1' });
    const input = doc.querySelector('tr[data-share-id="r1"] input[readonly]');
    expect(input?.getAttribute('value')).toBe('https://wiki.example.com/share/abc');
    expect(doc.querySelector('tr[data-share-id="r1"] button[title="Copy link"]')).not.toBeNull();
  });

  test('a row with no address shows none', async () => {
    const doc = await render({ rows: [{ ...ROW, status: 'revoked', actions: [] }] });
    expect(doc.querySelector('tr[data-share-id="r1"] input[readonly]')).toBeNull();
  });
});
