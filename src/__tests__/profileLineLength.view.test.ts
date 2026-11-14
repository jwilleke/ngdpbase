/**
 * #2399: the profile's Line Length choice says what "the site's setting" is
 * right now, and "Reset to Defaults" puts the choice back on it.
 *
 * Renders the real profile.ejs with header and footer stubbed out.
 */
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { describe, expect, test } from 'vitest';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../views');

const user = {
  username: 'alice', email: 'alice@example.com', displayName: 'Alice', roles: ['reader'], isExternal: false,
  createdAt: '2026-01-01T00:00:00.000Z', lastLogin: null, profilePage: null, preferences: {}
};

function locals(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pageName: '', title: 'Profile', csrfToken: 'csrf-value', error: null, success: null,
    user, permissions: ['page-read'],
    contactDetails: null, pendingEmail: null, contactDetailsSaved: null, contactDetailsError: null,
    consents: [], addonConsentPending: {}, credentials: [], credentialsUnavailable: false,
    connectedIdentities: [], connectableProviders: [], passkeyHost: 'localhost', approvedApps: [],
    delegations: [], proxyAccess: { given: [], actingFor: [], owner: 'alice', options: [], vaultBlocked: false },
    offerEmailSecondFactor: false, hasPassword: true,
    unusedVaultFiles: [], vaultRepairs: [], vaultRepairNotice: null, vaultRepairError: null,
    agentTokensEnabled: true, agentTokensCanExtend: false, captureStartsPrivate: false,
    availableTimezones: [], availableDateFormats: [],
    contributions: { privatePages: 0, pages: 0, edits: 0, comments: 0 },
    addonProfileSections: [], myShares: { active: 0, total: 0 },
    jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`, lockedUnless: () => '',
    nonce: 'n',
    ...over
  };
}

async function renderHtml(over: Record<string, unknown> = {}): Promise<string> {
  return ejs.renderFile(path.join(VIEWS, 'profile.ejs'), locals(over), {
    includer: (original: string) => (original === 'header' || original === 'footer' ? { template: '' } : undefined) as never
  });
}

const siteOption = (html: string): string =>
  (new JSDOM(html).window.document.querySelector('#lineLength option[value="site"]')?.textContent ?? '').trim();

describe('profile.ejs Line Length (#2399)', () => {
  test('says the site is on short lines', async () => {
    expect(siteOption(await renderHtml({ siteLineLength: 'short' }))).toBe("Use the site's setting (currently short lines)");
  });

  test('says the site is on full width', async () => {
    expect(siteOption(await renderHtml({ siteLineLength: 'full' }))).toBe("Use the site's setting (currently full width)");
  });

  test('without a site value, keeps the plain wording', async () => {
    expect(siteOption(await renderHtml())).toBe("Use the site's setting");
  });

  test('Reset to Defaults puts Line Length back on the site setting', async () => {
    const html = await renderHtml({ siteLineLength: 'full' });
    const reset = html.slice(html.indexOf('function resetPreferences()'));
    expect(reset.slice(0, reset.indexOf('\n}\n'))).toContain("document.getElementById('lineLength').value = 'site'");
  });
});

describe('themes/core.css plugin pictures with short lines (#2399)', () => {
  const css = fs.readFileSync(path.join(VIEWS, '../themes/core.css'), 'utf8');
  const ruleFor = (selectorPart: string): string => {
    const at = css.indexOf(selectorPart);
    expect(at).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  };

  test('the captioned picture box is capped at the short measure, at low weight', () => {
    const rule = ruleFor(':where([data-line-length="short"]) .markdown-body .image-plugin-container');
    expect(rule).toContain('max-width: min(100%, var(--ngdp-short-measure, 36em))');
  });

  test('a box the plugin centred by default moves to the text edge; an explicit text-center stays centred', () => {
    const rule = ruleFor(':where([data-line-length="short"]) .markdown-body .image-plugin-container:not(.text-center)');
    expect(rule).toContain('margin-inline: 0 !important');
  });

  test('a box the author centred sits at the text edge (!important beats the inline margin), so its centre is the text centre', () => {
    const rule = ruleFor(':where([data-line-length="short"]) .markdown-body .image-plugin-container.text-center {');
    expect(rule).toContain('margin-inline: 0 !important');
  });

  test('the picture inside a centred box is centred in it, !important to beat the inline and Fairways margins', () => {
    const rule = ruleFor(':where([data-line-length="short"]) .markdown-body .image-plugin-container.text-center :where(img)');
    expect(rule).toContain('margin-inline: auto !important');
  });

  test('the caption of a centred box is centred in it', () => {
    const rule = ruleFor(':where([data-line-length="short"]) .markdown-body .image-plugin-container.text-center .image-caption');
    expect(rule).toContain('text-align: center');
  });

  test('every Short lines rule for centred boxes stays inside :where([data-line-length="short"])', () => {
    const lines = css.split('\n').filter(l => l.includes('.image-plugin-container.text-center'));
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const l of lines) expect(l.startsWith(':where([data-line-length="short"])')).toBe(true);
  });
});
