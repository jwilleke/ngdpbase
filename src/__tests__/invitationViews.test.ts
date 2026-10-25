/**
 * #2049 — what admins and invited users see. Renders the real views, as
 * Express does: the admin list marks an invited account "Invited" until its
 * end date with Resend and Cancel; an account with no way in yet offers Send;
 * when email is not working the create form says so and offers no
 * invitation; the link page shows a Continue button only for a live link.
 *
 * Sabotaged once each (then restored): the "Invited" badge's `user.invitation`
 * guard, and the create form's `disabled` when invitations are unavailable,
 * each turned the matching test red.
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
const admin = { username: 'admin', displayName: 'Admin', roles: ['admin'], isAuthenticated: true };
const LIST = { currentUser: admin, roles: [], roleGrants: {}, successMessage: null, errorMessage: null, statFiltersHtml: '' };
const row = (username: string, extra: Record<string, unknown> = {}) => ({
  username, displayName: username, email: `${username}@example.com`, roles: ['reader'], isActive: true, isSystem: false, loginCount: 0, invitation: null, awaitingSetup: false, ...extra
});

describe('#2049 the admin user list', () => {
  test('an invited account says "Invited" until its end date, with Resend and Cancel', async () => {
    const doc = await render('admin-users.ejs', {
      ...LIST, invitationsUnavailable: null,
      users: [row('newbie', { awaitingSetup: true, invitation: { id: 'i', username: 'newbie', createdBy: 'admin', createdAt: '2026-10-25T00:00:00.000Z', expiresAt: '2026-11-01T00:00:00.000Z' } }), row('jim', { loginCount: 4 })]
    });
    const newbie = doc.querySelector('tr[data-username="newbie"]');
    expect(text(newbie?.querySelector('[data-invited]'))).toBe('Invited');
    expect(newbie?.querySelector('time[data-local-time]')?.getAttribute('datetime')).toBe('2026-11-01T00:00:00.000Z');
    expect(text(newbie?.querySelector('[data-invite-send]'))).toBe('Resend invitation');
    expect(newbie?.querySelector('form[action="/admin/users/newbie/invitation/cancel"] [data-invite-cancel]')).not.toBeNull();
    const jim = doc.querySelector('tr[data-username="jim"]');
    expect(jim?.querySelector('[data-invited]')).toBeNull();
    expect(jim?.querySelector('[data-invite-send]')).toBeNull();
  });

  test('an account with no way in and no invitation is "Not set up", with Send', async () => {
    const doc = await render('admin-users.ejs', { ...LIST, invitationsUnavailable: null, users: [row('newbie', { awaitingSetup: true })] });
    const newbie = doc.querySelector('tr[data-username="newbie"]');
    expect(newbie?.querySelector('[data-not-set-up]')).not.toBeNull();
    expect(text(newbie?.querySelector('[data-invite-send]'))).toBe('Send invitation');
    expect(newbie?.querySelector('[data-invite-cancel]')).toBeNull();
  });

  test('email not working: the create form says so, offers no invitation, and Send is disabled', async () => {
    const why = 'Email is not working on this site right now, so no invitation can be sent.';
    const doc = await render('admin-users.ejs', { ...LIST, invitationsUnavailable: why, users: [row('newbie', { awaitingSetup: true })] });
    expect(doc.querySelector<HTMLInputElement>('#invite')?.hasAttribute('disabled')).toBe(true);
    expect(text(doc.querySelector('[data-invitations-unavailable]'))).toBe(`${why} Set a password for the account instead.`);
    expect(doc.querySelector('[data-invite-send]')?.hasAttribute('disabled')).toBe(true);
    expect(doc.querySelector('#password')).not.toBeNull();
  });

  test('email working: the create form offers the invitation, unticked', async () => {
    const doc = await render('admin-users.ejs', { ...LIST, invitationsUnavailable: null, users: [] });
    const box = doc.querySelector<HTMLInputElement>('#invite');
    expect(box?.hasAttribute('disabled')).toBe(false);
    expect(box?.hasAttribute('checked')).toBe(false);
    expect(doc.querySelector('[data-invitations-unavailable]')).toBeNull();
  });
});

describe('#2049 the invitation link page', () => {
  test('a live link shows who it is for and a Continue button posting the token', async () => {
    const doc = await render('invitation.ejs', {
      currentUser: null, applicationName: 'Willeke Family', token: 'tok',
      invitation: { username: 'newbie', displayName: 'New Bie', expiresAt: '2026-11-01T00:00:00.000Z' }
    });
    expect(text(doc.querySelector('[data-testid="invitation"]'))).toContain('with the username newbie');
    expect(doc.querySelector<HTMLInputElement>('form[action="/invitation"] input[name="t"]')?.value).toBe('tok');
    expect(doc.querySelector('[data-testid="invitation-continue"]')).not.toBeNull();
  });

  test('a used, expired or cancelled link says so, with no button', async () => {
    const doc = await render('invitation.ejs', { currentUser: null, applicationName: 'Willeke Family', token: '', invitation: null });
    expect(doc.querySelector('[data-testid="invitation-dead"]')).not.toBeNull();
    expect(doc.querySelector('[data-testid="invitation-continue"]')).toBeNull();
  });
});
