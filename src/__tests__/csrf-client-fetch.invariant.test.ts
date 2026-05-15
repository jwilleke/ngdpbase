/**
 * #727 regression net — client-side state-changing fetches must carry the
 * CSRF token (the #663 app-wide middleware rejects tokenless POST/PUT/
 * DELETE/PATCH with a text/plain 403, which the client's r.json() then
 * chokes on, surfacing only an opaque failure).
 *
 * This is a content invariant, not a behavioural test: unit suites mock
 * the middleware away and there is little/no E2E for these surfaces, so
 * the bug class (#690, #709, and the High-severity rows of #727) escapes
 * every other layer. Asserting the source uses `csrfFetch` is the only
 * cheap net that actually catches a regression to raw `fetch(`.
 *
 * Each entry: a file that performs a state-changing request from the
 * browser, and the bare `fetch(` snippet that must NOT reappear.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '../..');

interface Surface {
  file: string;
  /** A substring proving the token-bearing form is present. */
  mustContain: string;
  /** Bare-fetch snippets that must NOT appear (would be tokenless). */
  mustNotContain: string[];
}

const SURFACES: Surface[] = [
  {
    file: 'views/view.ejs',
    mustContain: '(window.csrfFetch || fetch)(`/delete/${encodeURIComponent(pageName)}`',
    mustNotContain: ['fetch(`/delete/${encodeURIComponent(pageName)}`']
  },
  {
    file: 'views/page-history.ejs',
    mustContain: '(window.csrfFetch || fetch)(`/api/page/${encodeURIComponent(pageName)}/restore/',
    mustNotContain: ['fetch(`/api/page/${encodeURIComponent(pageName)}/restore/']
  },
  {
    file: 'addons/forms/public/js/forms-submit.js',
    mustContain: "(window.csrfFetch || fetch)('/api/forms/submit/'",
    mustNotContain: ["fetch('/api/forms/submit/'"]
  },
  {
    file: 'addons/calendar/public/js/calendar-modal.js',
    mustContain: "(window.csrfFetch || fetch)('/api/calendar/events/'",
    mustNotContain: ["fetch('/api/calendar/events/'"]
  },
  {
    file: 'views/admin-user-edit.ejs',
    mustContain: '(window.csrfFetch || fetch)(`/admin/users/${username}`',
    mustNotContain: ['fetch(`/admin/users/${username}`']
  },
  {
    file: 'views/admin-roles.ejs',
    mustContain: '(window.csrfFetch || fetch)(`/admin/roles/${roleName}`',
    mustNotContain: ['fetch(`/admin/roles/${roleName}`']
  },
  {
    file: 'views/export.ejs',
    mustContain: '(window.csrfFetch || fetch)(url, {',
    mustNotContain: ['fetch(url, {']
  },
  {
    file: 'views/exports.ejs',
    mustContain: "(window.csrfFetch || fetch)(url, { method: 'DELETE' })",
    mustNotContain: ["fetch(url, { method: 'DELETE' })"]
  },
  {
    file: 'src/plugins/CommentsPlugin.ts',
    mustContain: "(window.csrfFetch || fetch)('/api/comments/' + pageUuid,",
    mustNotContain: ["fetch('/api/comments/' + pageUuid,"]
  },
  {
    file: 'src/plugins/CommentsPlugin.ts',
    mustContain: "(window.csrfFetch || fetch)('/api/comments/' + pageUuid + '/' + commentId,",
    mustNotContain: ["fetch('/api/comments/' + pageUuid + '/' + commentId,"]
  }
];

describe('#727 — client state-changing fetches carry the CSRF token', () => {
  for (const s of SURFACES) {
    test(`${s.file} uses csrfFetch for its mutation`, () => {
      const src = readFileSync(path.join(REPO, s.file), 'utf-8');
      expect(src).toContain(s.mustContain);
      for (const bad of s.mustNotContain) {
        // The token-bearing form is `(window.csrfFetch || fetch)(...)`,
        // which itself contains the bad substring as a suffix — so we
        // assert the bad form never appears WITHOUT the csrfFetch prefix
        // immediately before it.
        const bareOccurrences = src
          .split(bad)
          .slice(0, -1)
          .filter((chunk) => !chunk.endsWith('(window.csrfFetch || '));
        expect(bareOccurrences).toHaveLength(0);
      }
    });
  }
});
