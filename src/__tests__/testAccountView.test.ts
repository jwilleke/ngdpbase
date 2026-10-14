/**
 * #1805 — a test account is marked where people see it: "Test account" on its
 * row in the admin user list, and a banner on every page for the person
 * signed in to it. Nobody else sees the banner. Renders the real views, as
 * Express does.
 *
 * Sabotaged once (then restored): the header banner's `currentUser.isTest ===
 * true` guard dropped — the "a real account does not" test went red.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');

const COMMON = {
  pageName: '', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`,
  lockedUnless: () => ''
};

async function render(file: string, locals: Record<string, unknown>): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, file), { ...COMMON, ...locals });
  return new JSDOM(html).window.document;
}

const text = (el: { textContent: string | null } | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

const signedIn = (isTest: boolean) => ({ username: 'qa', displayName: 'QA', roles: ['reader'], isAuthenticated: true, isTest });

describe('#1805 the test-account banner', () => {
  test('the person signed in to a test account sees it', async () => {
    const doc = await render('header.ejs', { currentUser: signedIn(true) });
    expect(text(doc.querySelector('[data-test-account-banner]'))).toMatch(/^You are signed in to a test account\./);
  });

  test('a real account does not', async () => {
    const doc = await render('header.ejs', { currentUser: signedIn(false) });
    expect(doc.querySelector('[data-test-account-banner]')).toBeNull();
  });

  test('nor does a visitor who is signed out', async () => {
    const doc = await render('header.ejs', { currentUser: { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false } });
    expect(doc.querySelector('[data-test-account-banner]')).toBeNull();
  });
});

describe('#1805 the admin user list', () => {
  const row = (username: string, isTest: boolean) => ({
    username, displayName: username, email: `${username}@example.com`, roles: ['reader'], isActive: true, isSystem: false, isTest, loginCount: 0
  });

  test('marks a test account "Test account", and no other', async () => {
    const doc = await render('admin-users.ejs', {
      currentUser: signedIn(false), users: [row('qa', true), row('jim', false)], roles: [], roleGrants: {}, successMessage: null, errorMessage: null, statFiltersHtml: ''
    });
    const marks = [...doc.querySelectorAll('tr[data-username]')].map((tr) => [tr.getAttribute('data-username'), text(tr.querySelector('[data-test-account]'))]);
    expect(marks).toEqual([['qa', 'Test account'], ['jim', '']]);
  });

  test('the create form offers the checkbox, unticked', async () => {
    const doc = await render('admin-users.ejs', { currentUser: signedIn(false), users: [], roles: [], roleGrants: {}, successMessage: null, errorMessage: null, statFiltersHtml: '' });
    const box = doc.querySelector<HTMLInputElement>('#createUserModal input[name="isTest"]');
    expect(box?.getAttribute('value')).toBe('true');
    expect(box?.hasAttribute('checked')).toBe(false);
    expect(text(doc.querySelector('label[for="isTest"]'))).toBe('Test account');
  });
});
