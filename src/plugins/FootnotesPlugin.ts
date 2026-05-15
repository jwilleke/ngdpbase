/**
 * FootnotesPlugin — renders footnote definitions from sidecar storage (FootnoteManager)
 * with a CRUD UI for authorised users. Falls back to reading the page body for legacy
 * pages not yet migrated to sidecar storage.
 *
 * Sidecar format: ${SLOW_STORAGE}/footnotes/{pageUuid}.json
 * Migration script: scripts/migrate-footnotes-to-sidecar.mjs
 * Tracking issue: #553 / #557
 *
 * Syntax:
 *   [{FootnotesPlugin}]
 *   [{FootnotesPlugin noheader='true'}]
 *
 * Parameters:
 *   noheader — suppress the "Footnotes" heading (default: false)
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import WikiContext from '../context/WikiContext.js';
import type FootnoteManager from '../managers/FootnoteManager.js';
import type { PageFootnote } from '../managers/FootnoteManager.js';
import { parseBoolParam, escapeHtml } from '../utils/pluginFormatters.js';

interface PageManagerLike {
  getPage(name: string): Promise<{ content?: string; rawContent?: string } | null>;
}

interface InterWikiSiteConfig {
  url: string;
  enabled?: boolean;
  openInNewWindow?: boolean;
}

interface ConfigManagerLike {
  getProperty<T>(key: string, defaultValue?: T): T;
}

// ── Legacy body-parsing (fallback for unmigrated pages) ──────────────────────

const MD_FOOTNOTE_DEF_RE = /^\[\^([\d\w-]+)\]:\s*(.+)$/mg;
const MD_FOOTNOTE_BULLET_RE = /^\* \[\^(\d+)\] - (.+)$/mg;
const JSPWIKI_FOOTNOTE_RE = /^\* \[#(\d+)\] - (.+)$/mg;

function autoLink(text: string): string {
  return escapeHtml(text).replace(
    /(https?:\/\/[^\s<&]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function renderWikiLink(raw: string, interWikiSites: Map<string, InterWikiSiteConfig>): string {
  const mdLinkRe = /(?<!!)\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const result = raw.replace(mdLinkRe, (_m: string, display: string, url: string) =>
    `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(display)}</a>`
  );
  const linkRe = /\[([^|]+)\|([^|\]]+)(?:\|[^\]]+)?\]/g;
  return result.replace(linkRe, (_m: string, display: string, target: string) => {
    const colonIdx = target.indexOf(':');
    if (colonIdx > 0) {
      const prefix = target.slice(0, colonIdx);
      const pagePart = target.slice(colonIdx + 1).replace(/\/+$/, '');
      const site = interWikiSites.get(prefix) ?? interWikiSites.get(prefix.toLowerCase());
      if (site?.enabled !== false && site?.url) {
        const resolvedUrl = site.url.replace(/%s/g, encodeURIComponent(pagePart));
        const newWindow = site.openInNewWindow !== false;
        return `<a href="${escapeHtml(resolvedUrl)}"${newWindow ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(display)}</a>`;
      }
    }
    return `<a href="${escapeHtml(target)}" target="_blank" rel="noopener noreferrer">${escapeHtml(display)}</a>`;
  });
}

async function readLegacyFootnotes(
  pageName: string,
  pageManager: PageManagerLike,
  interWikiSites: Map<string, InterWikiSiteConfig>
): Promise<Array<{ id: string; html: string }>> {
  const page = await pageManager.getPage(pageName);
  if (!page) return [];
  const raw = String(page.rawContent ?? page.content ?? '').replace(/\r\n/g, '\n');
  const footnotes: Array<{ id: string; html: string }> = [];

  MD_FOOTNOTE_DEF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MD_FOOTNOTE_DEF_RE.exec(raw)) !== null) {
    footnotes.push({ id: m[1], html: autoLink(m[2].trim()) });
  }
  MD_FOOTNOTE_BULLET_RE.lastIndex = 0;
  while ((m = MD_FOOTNOTE_BULLET_RE.exec(raw)) !== null) {
    footnotes.push({ id: m[1], html: renderWikiLink(m[2].trim(), interWikiSites) });
  }
  JSPWIKI_FOOTNOTE_RE.lastIndex = 0;
  while ((m = JSPWIKI_FOOTNOTE_RE.exec(raw)) !== null) {
    if (!footnotes.find(f => f.id === m![1])) {
      footnotes.push({ id: m[1], html: renderWikiLink(m[2].trim(), interWikiSites) });
    }
  }
  footnotes.sort((a, b) => {
    const na = parseInt(a.id, 10), nb = parseInt(b.id, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.id.localeCompare(b.id);
  });
  return footnotes;
}

// ── Render helpers ───────────────────────────────────────────────────────────

function renderFootnoteRow(fn: PageFootnote, canEdit: boolean, canDelete: boolean, pageUuid: string): string {
  const urlHtml = fn.url
    ? `<a href="${escapeHtml(fn.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(fn.display || fn.url)}</a>`
    : escapeHtml(fn.display);
  const noteHtml = fn.note ? ` <span class="footnote-note text-muted small">— ${escapeHtml(fn.note)}</span>` : '';
  const actions: string[] = [];
  if (canEdit) {
    actions.push(
      '<button class="btn btn-sm btn-outline-secondary ms-2 footnote-edit-btn" ' +
      `data-id="${escapeHtml(fn.id)}" data-display="${escapeHtml(fn.display)}" ` +
      `data-url="${escapeHtml(fn.url)}" data-note="${escapeHtml(fn.note)}">Edit</button>`
    );
  }
  if (canDelete) {
    actions.push(
      '<button class="btn btn-sm btn-outline-danger ms-1 footnote-delete-btn" ' +
      `data-id="${escapeHtml(fn.id)}" data-uuid="${escapeHtml(pageUuid)}">Delete</button>`
    );
  }
  return (
    `<li id="footnote-${escapeHtml(fn.id)}" class="footnote-item">` +
    `<sup><a href="#footnote-ref-${escapeHtml(fn.id)}">[${escapeHtml(fn.id)}]</a></sup> ` +
    urlHtml + noteHtml +
    (actions.length ? `<span class="footnote-actions">${actions.join('')}</span>` : '') +
    '</li>'
  );
}

/**
 * Render the inner footnote-list HTML for a page given its UUID and the
 * caller's identity. Shared between the plugin output and the
 * `GET /api/footnotes/:uuid/html` endpoint added in #590.
 *
 * Returns either an `<ol class="footnote-list">…</ol>` or a "no footnotes"
 * paragraph — never wraps in the outer `<section>` or container.
 */
export async function renderFootnoteListHtml(
  footnoteManager: FootnoteManager,
  pageUuid: string,
  userContext: { isAuthenticated?: boolean; username?: string; roles?: string[] } | undefined
): Promise<string> {
  const isAuthenticated = userContext?.isAuthenticated === true;
  const isEditor = isAuthenticated && WikiContext.userHasRole(userContext, 'editor', 'contributor', 'admin');
  const isAdmin = WikiContext.userHasRole(userContext, 'admin');

  const footnotes: PageFootnote[] = await footnoteManager.getFootnotes(pageUuid);

  if (footnotes.length === 0) {
    return '<p class="no-footnotes"><em>No footnotes on this page.</em></p>';
  }

  const rows: string[] = ['<ol class="footnote-list">'];
  for (const fn of footnotes) {
    const canDelete = isAdmin || (isAuthenticated && fn.createdBy === userContext?.username);
    rows.push(renderFootnoteRow(fn, isEditor, canDelete, pageUuid));
  }
  rows.push('</ol>');
  return rows.join('\n');
}

function renderCrudScript(pageUuid: string): string {
  // #590: replace location.reload() with a fetch-and-swap of the
  // #footnote-list-host container. Event delegation on the host lets newly
  // rendered Edit/Delete buttons keep working without re-binding listeners.
  return `<script>
(function() {
  const _uuid = ${JSON.stringify(pageUuid)};
  const host = document.getElementById('footnote-list-host');
  const form = document.getElementById('footnote-add-form');

  function refreshList() {
    return fetch('/api/footnotes/' + _uuid + '/html')
      .then(r => r.text())
      .then(html => { if (host) host.innerHTML = html; })
      .catch(() => { /* swallow; user will see stale list until next view */ });
  }

  function resetForm() {
    if (!form) return;
    form.reset();
    form.dataset.editId = '';
    const submitBtn = form.querySelector('button[type=submit]');
    if (submitBtn) submitBtn.textContent = 'Add Footnote';
  }

  // Single submit handler — POST to add, PUT when editing.
  form?.addEventListener('submit', function(e) {
    e.preventDefault();
    const editId = form.dataset.editId;
    const display = form.querySelector('[name=display]').value.trim();
    const url = form.querySelector('[name=url]').value.trim();
    const note = form.querySelector('[name=note]').value.trim();
    const isEdit = !!editId;
    const target = isEdit ? '/api/footnotes/' + _uuid + '/' + editId : '/api/footnotes/' + _uuid;
    // #709: state-changing requests must carry the CSRF token (#663
    // app-wide middleware). Raw fetch() got a text/plain 403 that
    // r.json() then choked on, surfacing only the opaque .catch()
    // "Failed to add footnote." csrfFetch injects X-CSRF-Token.
    (window.csrfFetch || fetch)(target, {
      method: isEdit ? 'PUT' : 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ display, url, note })
    }).then(r => r.json()).then(d => {
      if (d.success) {
        resetForm();
        return refreshList();
      }
      alert(d.error || 'Failed');
    }).catch(() => alert(isEdit ? 'Failed to update footnote.' : 'Failed to add footnote.'));
  });

  // Delegated click handlers — survive DOM swaps.
  host?.addEventListener('click', function(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const delBtn = target.closest('.footnote-delete-btn');
    if (delBtn) {
      const id = delBtn.dataset.id;
      if (!confirm('Delete footnote [' + id + ']?')) return;
      // #709: DELETE is state-changing — needs the CSRF token too.
      (window.csrfFetch || fetch)('/api/footnotes/' + _uuid + '/' + id, { method: 'DELETE' })
        .then(r => r.json()).then(d => {
          if (d.success) return refreshList();
          alert(d.error || 'Failed');
        })
        .catch(() => alert('Failed to delete footnote.'));
      return;
    }

    const editBtn = target.closest('.footnote-edit-btn');
    if (editBtn && form) {
      form.querySelector('[name=display]').value = editBtn.dataset.display || '';
      form.querySelector('[name=url]').value = editBtn.dataset.url || '';
      form.querySelector('[name=note]').value = editBtn.dataset.note || '';
      form.dataset.editId = editBtn.dataset.id;
      const submitBtn = form.querySelector('button[type=submit]');
      if (submitBtn) submitBtn.textContent = 'Save Changes';
      form.scrollIntoView({ behavior: 'smooth' });
    }
  });
})();
</script>`;
}

// ── Plugin ───────────────────────────────────────────────────────────────────

const FootnotesPlugin: SimplePlugin = {
  name: 'FootnotesPlugin',
  description: 'Lists footnote definitions from sidecar storage with editor CRUD UI',
  author: 'ngdpbase',
  version: '2.0.0',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const engine = context.engine;
    if (!engine) return '';

    const pageName = context.pageName;
    const pageMetadata = context.pageMetadata as { uuid?: string } | undefined;
    const pageUuid = pageMetadata?.uuid;

    const noheader = parseBoolParam(params?.['noheader'], false);

    const userContext = context.userContext as {
      isAuthenticated?: boolean;
      username?: string;
      roles?: string[];
    } | undefined;
    const isAuthenticated = userContext?.isAuthenticated === true;
    const isEditor = isAuthenticated && WikiContext.userHasRole(userContext, 'editor', 'contributor', 'admin');
    // isAdmin is computed inside renderFootnoteListHtml() per row; not needed here.

    const parts: string[] = ['<section class="page-footnotes">'];
    if (!noheader) parts.push('<h2>Footnotes</h2>');

    // ── Try sidecar first ────────────────────────────────────────────────────
    const footnoteManager = engine.getManager('FootnoteManager') as FootnoteManager | undefined;

    if (footnoteManager?.isEnabled() && pageUuid) {
      // List wrapped in a stable container so #590 can swap its innerHTML
      // after add/edit/delete instead of doing a full page reload.
      const listHtml = await renderFootnoteListHtml(footnoteManager, pageUuid, userContext);
      parts.push(`<div id="footnote-list-host" data-page-uuid="${escapeHtml(pageUuid)}">`);
      parts.push(listHtml);
      parts.push('</div>');

      if (isEditor) {
        parts.push(`
<form id="footnote-add-form" class="footnote-add-form mt-3">
  <div class="row g-2 align-items-end">
    <div class="col-md-4">
      <label class="form-label form-label-sm">Display text</label>
      <input type="text" name="display" class="form-control form-control-sm" placeholder="Source title" required>
    </div>
    <div class="col-md-5">
      <label class="form-label form-label-sm">URL</label>
      <input type="url" name="url" class="form-control form-control-sm" placeholder="https://…" required>
    </div>
    <div class="col-md-3">
      <label class="form-label form-label-sm">Note <span class="text-muted">(optional)</span></label>
      <input type="text" name="note" class="form-control form-control-sm" placeholder="e.g. accessed 2024-01">
    </div>
  </div>
  <button type="submit" class="btn btn-sm btn-primary mt-2">Add Footnote</button>
</form>`);
        parts.push(renderCrudScript(pageUuid));
      }

      parts.push('</section>');
      return parts.join('\n');
    }

    // ── Legacy fallback: read from page body ─────────────────────────────────
    if (!pageName) {
      parts.push('<p class="no-footnotes"><em>No footnotes on this page.</em></p>');
      parts.push('</section>');
      return parts.join('\n');
    }

    const pageManager = engine.getManager('PageManager') as PageManagerLike | undefined;
    if (!pageManager) {
      parts.push('</section>');
      return parts.join('\n');
    }

    const configManager = engine.getManager('ConfigurationManager') as ConfigManagerLike | undefined;
    const sitesConfig = configManager?.getProperty<Record<string, InterWikiSiteConfig>>(
      'ngdpbase.interwiki.sites', {}
    ) ?? {};
    const interWikiSites = new Map(Object.entries(sitesConfig));

    const footnotes = await readLegacyFootnotes(pageName, pageManager, interWikiSites);

    if (footnotes.length === 0) {
      parts.push('<p class="no-footnotes"><em>No footnotes on this page.</em></p>');
    } else {
      parts.push('<ol class="footnote-list">');
      for (const fn of footnotes) {
        parts.push(
          `<li id="footnote-${escapeHtml(fn.id)}" class="footnote-item">` +
          `<sup><a href="#footnote-ref-${escapeHtml(fn.id)}">[${escapeHtml(fn.id)}]</a></sup> ` +
          fn.html +
          '</li>'
        );
      }
      parts.push('</ol>');
    }

    parts.push('</section>');
    return parts.join('\n');
  }
};

export default FootnotesPlugin;
