/**
 * #1762 slice 7 — the proxy-access screens: the profile's list of people who
 * may act for you and its give form, the admin's form for someone else, and
 * the header's person picker. Plain words for the person, never permission
 * names; end dates as local-time markup; every form posts with `_csrf`.
 *
 * Renders the real partials and header, as Express does.
 *
 * Sabotaged once each (then restored): the proxy-grant warning element in
 * _proxy-grant-form.ejs (removed) — the warning test went red; the header's
 * picker guard (`grants.length > 0` dropped) — the "no live grants" test went
 * red.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import type { ProxyGrantView } from '../managers/AuthManager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');

const grant = (over: Partial<ProxyGrantView> = {}): ProxyGrantView => ({
  id: 'g-1', owner: 'mom', proxy: 'jim', permissions: ['page-read'], createdBy: 'mom', createdAt: '2026-10-12T08:00:00.000Z',
  expiresAt: null, vault: 'none', can: [{ name: 'page-read', description: 'View pages' }], mayRedelegate: false, ...over
});

async function render(file: string, locals: Record<string, unknown>): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, file), locals);
  return new JSDOM(html).window.document;
}

const text = (el: { textContent: string | null } | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('#1762 slice 7 — the people who may act for you', () => {
  test('each row names the person, what they may do in plain words, the end date as local time, and one Revoke to the door', async () => {
    const doc = await render('_proxy-grants.ejs', {
      grants: [
        grant(),
        grant({ id: 'g/2', proxy: 'sue', permissions: ['page-read', 'proxy-grant'], expiresAt: '2026-11-01T03:59:59.999Z',
          can: [{ name: 'page-read', description: 'View pages' }, { name: 'proxy-grant', description: 'Let someone act for you, and stop them' }], mayRedelegate: true })
      ],
      owner: 'mom', revokeBase: '/profile/proxy-access/', csrfToken: 'csrf-value', self: true
    });
    const rows = [...doc.querySelectorAll('tbody tr')];
    expect(rows.map(r => text(r.querySelector('td')))).toEqual(['jim', 'sue']);
    expect(text(rows[0].querySelectorAll('td')[2])).toBe('Until you revoke it');
    const time = rows[1].querySelector('time[data-local-time]');
    expect(time?.getAttribute('datetime')).toBe('2026-11-01T03:59:59.999Z');
    expect(text(time)).toBe('2026-11-01 03:59 UTC');
    // Labels, never names; the name only as the tooltip.
    expect([...rows[1].querySelectorAll('[data-scope]')].map(s => [s.textContent, s.getAttribute('title')]))
      .toEqual([['View pages', 'page-read'], ['Let someone act for you, and stop them', 'proxy-grant']]);
    expect(text(rows[1].querySelector('[data-proxy-redelegates]'))).toBe('sue can also give other people access to your account.');
    expect(rows[0].querySelector('[data-proxy-redelegates]')).toBeNull();
    const forms = [...doc.querySelectorAll('form')];
    expect(forms.map(f => f.getAttribute('action'))).toEqual(['/profile/proxy-access/g-1/revoke', '/profile/proxy-access/g%2F2/revoke']);
    expect(forms.every(f => f.getAttribute('method') === 'POST' && f.querySelector('input[name="_csrf"]')?.getAttribute('value') === 'csrf-value')).toBe(true);
    expect(forms[0].querySelector('button')?.getAttribute('aria-label')).toBe("Revoke jim's access");
  });

  test('a grant carrying a key copy says it includes the encrypted vaults (#1762 slice 5)', async () => {
    const doc = await render('_proxy-grants.ejs', { grants: [grant({ vault: 'copy' }), grant({ id: 'g-2', proxy: 'sue' })], owner: 'mom', revokeBase: '/x/', csrfToken: 't', self: true });
    const rows = [...doc.querySelectorAll('tbody tr')];
    expect(text(rows[0].querySelector('[data-proxy-vault-copy]'))).toBe('Including your encrypted vaults.');
    expect(rows[1].querySelector('[data-proxy-vault-copy]')).toBeNull();
  });

  test('an empty list says so', async () => {
    const doc = await render('_proxy-grants.ejs', { grants: [], owner: 'mom', revokeBase: '/x/', csrfToken: 't', self: true });
    expect(text(doc.body)).toBe('Nobody can act for you.');
  });
});

describe('#1762 slice 7 — the give form', () => {
  const OPTIONS = [
    { name: 'page-read', description: 'View pages' },
    { name: 'vault-proxy', description: 'Let someone acting for you into your vaults' },
    { name: 'proxy-grant', description: 'Let someone act for you, and stop them' }
  ];

  test('offers exactly the permissions given, by label, each a labelled checkbox; a person picker and an optional end date', async () => {
    const doc = await render('_proxy-grant-form.ejs', { action: '/profile/proxy-access', options: OPTIONS, owner: 'mom', self: true, csrfToken: 'csrf-value' });
    const form = doc.querySelector('form[data-proxy-grant-form]') as HTMLFormElement;
    expect(form.getAttribute('action')).toBe('/profile/proxy-access');
    expect(form.getAttribute('method')).toBe('POST');
    expect(form.querySelector('input[name="_csrf"]')?.getAttribute('value')).toBe('csrf-value');
    const boxes = [...form.querySelectorAll('input[type="checkbox"][name="permissions"]')];
    expect(boxes.map(b => b.getAttribute('value'))).toEqual(['page-read', 'vault-proxy', 'proxy-grant']);
    expect(boxes.map(b => text(doc.querySelector(`label[for="${b.id}"]`)))).toEqual(OPTIONS.map(o => o.description));
    // The person picker is the shared typeahead, single, posting `proxy`, with a label.
    const picker = form.querySelector('[data-audience-typeahead]');
    expect(picker?.getAttribute('data-audience-field')).toBe('proxy');
    expect(picker?.hasAttribute('data-audience-single')).toBe(true);
    const search = picker?.querySelector('input[data-audience-search]');
    expect(text(doc.querySelector(`label[for="${search?.id}"]`))).toBe('Who will act for you?');
    const end = form.querySelector('input[type="date"][name="endDate"]');
    expect(text(doc.querySelector(`label[for="${end?.id}"]`))).toBe('End date (optional)');
    // #1762 slice 5: encrypted vaults are shared when the owner chooses.
    expect(text(form.querySelector('[data-vault-shared]'))).toMatch(/^Your encrypted vaults open to them too, while they act for you\./);
    expect(boxes[1].hasAttribute('disabled')).toBe(false);
  });

  test('the vaults choice cannot be ticked while it is blocked, and says why (#1762 slice 5)', async () => {
    const why = 'Unlock your private store first: access to your encrypted vaults can only be given while it is open.';
    const doc = await render('_proxy-grant-form.ejs', { action: '/profile/proxy-access', options: OPTIONS, owner: 'mom', self: true, csrfToken: 't', vaultBlocked: why });
    const box = doc.querySelector('input[data-permission="vault-proxy"]');
    expect(box?.hasAttribute('disabled')).toBe(true);
    const reason = doc.querySelector('[data-vault-blocked]');
    expect(text(reason)).toBe(why);
    expect(box?.getAttribute('aria-describedby')).toBe(reason?.id);
    expect(doc.querySelector('[data-vault-shared]')).toBeNull();
    // Only that choice: the others stay open.
    expect(doc.querySelector('input[data-permission="page-read"]')?.hasAttribute('disabled')).toBe(false);
  });

  test('choosing proxy-grant has the decided warning beside it', async () => {
    const doc = await render('_proxy-grant-form.ejs', { action: '/profile/proxy-access', options: OPTIONS, owner: 'mom', self: true, csrfToken: 't' });
    const warning = doc.querySelector('input[data-permission="proxy-grant"]')?.closest('.form-check')?.querySelector('[data-proxy-redelegate-warning]');
    expect(text(warning)).toBe('This person will be able to give other people access to your account.');
    expect(warning?.querySelector('[data-proxy-name]')).not.toBeNull();
    // Without proxy-grant on offer, no warning.
    const without = await render('_proxy-grant-form.ejs', { action: '/x', options: OPTIONS.slice(0, 1), owner: 'mom', self: true, csrfToken: 't' });
    expect(without.querySelector('[data-proxy-redelegate-warning]')).toBeNull();
  });

  test('the admin form says plainly it never includes encrypted information, and names the person', async () => {
    const doc = await render('_proxy-grant-form.ejs', { action: '/admin/users/mom/proxy-access', options: [OPTIONS[0], OPTIONS[2]], owner: 'mom', self: false, csrfToken: 't' });
    expect(text(doc.querySelector('[data-proxy-admin-note]'))).toBe("Access given here can never include mom's encrypted information or vaults. Only mom can add that.");
    expect(text(doc.querySelector('[data-proxy-redelegate-warning]'))).toBe("This person will be able to give other people access to mom's account.");
    expect(doc.querySelector('input[value="vault-proxy"]')).toBeNull();
  });
});

describe('#1762 slice 7 — the header person picker', () => {
  const header = (locals: Record<string, unknown>): Promise<Document> => render('header.ejs', {
    pageName: '', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`, ...locals
  });

  test('someone a live grant names sees Act as: Yourself and each person, posting to the switch door and back to this page', async () => {
    const doc = await header({ actingForPicker: { self: 'jim', actingFor: null, grants: [grant(), grant({ id: 'g-2', owner: 'dad' })], returnTo: '/view/Home' } });
    const form = doc.querySelector('form[data-acting-for-picker]');
    expect(form?.getAttribute('action')).toBe('/account/acting-for');
    expect(form?.querySelector('input[name="_csrf"]')?.getAttribute('value')).toBe('csrf-value');
    expect(form?.querySelector('input[name="returnTo"]')?.getAttribute('value')).toBe('/view/Home');
    const select = form?.querySelector('select[name="grant"]');
    expect(text(doc.querySelector(`label[for="${select?.id}"]`))).toBe('Act as');
    expect([...(select?.querySelectorAll('option') ?? [])].map(o => [o.getAttribute('value'), text(o)])).toEqual([['', 'Yourself (jim)'], ['g-1', 'mom'], ['g-2', 'dad']]);
    expect(doc.querySelector('[data-acting-for]')).toBeNull();
  });

  test('while acting, the banner keeps Switch back, and the picker shows whom', async () => {
    const doc = await header({ actingFor: { name: 'mom' }, actingForPicker: { self: 'jim', actingFor: 'g-1', grants: [grant()], returnTo: '/' } });
    const banner = doc.querySelector('[data-acting-for]');
    expect(text(banner)).toMatch(/^Acting for mom · Switch back/);
    expect(banner?.querySelector('select option[selected]')?.getAttribute('value')).toBe('g-1');
  });

  test('no picker without live grants', async () => {
    expect((await header({})).querySelector('[data-acting-for-picker]')).toBeNull();
    expect((await header({ actingForPicker: { self: 'jim', actingFor: null, grants: [], returnTo: '/' } })).querySelector('[data-acting-for-picker]')).toBeNull();
  });
});
