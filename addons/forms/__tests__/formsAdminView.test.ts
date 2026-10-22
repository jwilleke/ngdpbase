/**
 * #1973 — the forms admin shows a form an add-on provides as read-only:
 * "Provided by <addon> <version>; it updates this form", linking to Admin →
 * Add-ons, with no Edit or Delete. A site-built form keeps both. No Sync,
 * Force Sync or "needs an update" banner is drawn any more.
 *
 * Renders the real view, as Express does (header and footer stubbed).
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEW = path.join(__dirname, '../views/forms-admin.ejs');
const CORE_VIEWS = path.join(__dirname, '../../../views');

const includer = (original: string): { template: string } | undefined =>
  original === 'header' || original === 'footer' ? { template: '<!-- stub -->' } : undefined;

const fields = [{ name: 'a', type: 'text', label: 'A', required: false }];

test('a provided form says who provides it and offers no Edit or Delete; a site form keeps both', async () => {
  const html = await ejs.renderFile(VIEW, {
    currentUser: null, query: {}, csrfToken: 'tok', locals: {},
    forms: [
      { id: 'phr-note', title: 'Health note', fields, submissionCount: 0, providedBy: { addon: 'phr', version: '1.2.0' } },
      { id: 'ours', title: 'Ours', fields, submissionCount: 0 }
    ]
  }, { views: [CORE_VIEWS], includer });
  const doc = new JSDOM(html).window.document;
  const card = (id: string) => [...doc.querySelectorAll('.card')].find(c => c.querySelector('code')?.textContent === id)!;

  const provided = card('phr-note');
  expect(provided.querySelector('[data-testid="provided-by"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Provided by phr 1.2.0; it updates this form.');
  expect(provided.querySelector('[data-testid="provided-by"] a')?.getAttribute('href')).toBe('/admin/addons');
  expect(provided.querySelector('a[href^="/addons/forms/builder/"]')).toBeNull();
  expect(provided.querySelector('form[action$="/delete"]')).toBeNull();
  expect(provided.querySelector('a[href="/addons/forms/phr-note/submissions"]')).not.toBeNull();

  const site = card('ours');
  expect(site.querySelector('[data-testid="provided-by"]')).toBeNull();
  expect(site.querySelector('a[href="/addons/forms/builder/ours"]')).not.toBeNull();
  expect(site.querySelector('form[action="/addons/forms/builder/ours/delete"]')).not.toBeNull();

  expect(doc.querySelector('[data-action="sync"], [data-action="force-sync"], #shippedForms')).toBeNull();
});
