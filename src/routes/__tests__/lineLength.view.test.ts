/**
 * The page carries the line-length choice on <body data-line-length>, so CSS is
 * the only thing that changes the width. Renders the real header template.
 *
 * @jest-environment node
 */
import { describe, it, expect } from 'vitest';
import ejs from 'ejs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pageUrl } from '../../utils/pageUrl.js';
import { jsonForScript } from '../../utils/jsonForScript.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../../views');

async function renderHeader(locals: Record<string, unknown>): Promise<string> {
  return ejs.renderFile(path.join(VIEWS, 'header.ejs'), { pageUrl, jsonForScript, ...locals }, { views: [VIEWS] });
}

describe('header.ejs line length (#2399)', () => {
  it('a signed-out visitor gets the site setting on the body', async () => {
    const html = await renderHeader({ lineLength: 'short', currentUser: null });
    expect(html).toMatch(/<body[^>]*data-line-length="short"/);
  });

  it('a signed-in person who chose full width gets full on the body', async () => {
    const html = await renderHeader({
      lineLength: 'full',
      currentUser: { isAuthenticated: true, username: 'pat', preferences: { 'display.line-length': 'full' } }
    });
    expect(html).toMatch(/<body[^>]*data-line-length="full"/);
  });

  it('a page that was given no choice sets no attribute', async () => {
    const html = await renderHeader({ currentUser: null });
    expect(html).not.toContain('data-line-length');
  });
});

describe('profile.ejs line length (#2399)', () => {
  const src = fs.readFileSync(path.join(VIEWS, 'profile.ejs'), 'utf8');

  it('offers the site setting, short lines and full width', () => {
    expect(src).toContain('name="display.line-length"');
    expect(src).toContain('Use the site\'s setting');
    expect(src).toContain('Short lines');
    expect(src).toContain('Full width');
  });
});
