/**
 * #2191 — a notice message carries one file path per line, so the views that
 * show a notice must keep the line breaks. The real views, rendered as Express does.
 */
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { describe, expect, test } from 'vitest';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../views');

const evil = '<a href="https://evil.example/login">x</a>.jpg';
const notification = {
  id: 'n1', level: 'error', title: 'Media files without a capture date', type: 'system',
  message: `3 file(s) have no date.\n\n2019/a.jpg\n${evil}\nand 1 more\n\nBackfill.`,
  createdAt: new Date(), expiresAt: null, dismissed: false
};

describe('#2191 notices keep one path per line', () => {
  test('admin-notifications renders the message with line breaks preserved and names escaped', async () => {
    const html = await ejs.renderFile(path.join(VIEWS, 'admin-notifications.ejs'), {
      pageName: '', csrfToken: 'csrf', title: 'Notification Management', notificationStatsHtml: '',
      allNotifications: [notification], activeNotifications: [notification], expiredNotifications: [],
      stats: { total: 1, active: 1, expired: 0, byType: {} }, successMessage: null, errorMessage: null,
      jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`, lockedUnless: () => ''
    });
    const doc = new JSDOM(html).window.document;
    const paragraphs = [...doc.querySelectorAll('p.mb-1')].filter(p => p.textContent?.includes('2019/a.jpg'));
    expect(paragraphs.length).toBeGreaterThan(0);
    for (const p of paragraphs) {
      expect((p as HTMLElement).style.whiteSpace).toBe('pre-line');
      expect(p.textContent).toContain('\n2019/a.jpg\n<a href=');
      expect(p.querySelector('a')).toBeNull();
    }
  });

  test.each(['admin-notifications.ejs', 'admin-dashboard.ejs'])('every notice message paragraph in %s is pre-line', (view) => {
    const src = fs.readFileSync(path.join(VIEWS, view), 'utf8');
    const tags = src.match(/<p [^>]*>\s*<%= notification\.message %>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toContain('white-space: pre-line');
  });
});
