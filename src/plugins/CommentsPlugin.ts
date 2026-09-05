import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { subjectMayDo } from '../utils/subjectMayDo.js';
import type CommentManager from '../managers/CommentManager.js';
import type { PageComment } from '../types/Comment.js';
import { parseBoolParam } from '../utils/pluginFormatters.js';
import { renderUntrustedInline } from '../utils/renderUntrustedInline.js';

/** Engine shape the untrusted-inline profile needs; kept loose for tests. */
type WikiEngineLike = { getManager: (name: string) => unknown };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Render just the inner comment-list HTML for a page. Shared between the
 * plugin output and the `GET /api/comments/:uuid/html` endpoint added in #590.
 *
 * Returns either a `<div class="comment-list">…</div>` or a "no comments yet"
 * paragraph — never wraps in the outer `<section>` or container.
 */
export async function renderCommentListHtml(
  comments: PageComment[],
  isAuthenticated: boolean,
  username: string,
  isAdmin: boolean,
  pageUuid: string,
  engine?: WikiEngineLike
): Promise<string> {
  if (comments.length === 0) {
    return '<p class="no-comments"><em>No comments yet.</em></p>';
  }
  const parts: string[] = ['<div class="comment-list">'];
  for (const c of comments) {
    const canDelete = isAdmin || (isAuthenticated && c.author === username);
    // #1123: comment bodies render through the untrusted-inline profile —
    // CommonMark formatting, plugin/variable syntax inert, SecurityFilter
    // forced on. Without an engine (or on any failure inside the profile)
    // this degrades to the pre-#1123 escaped text, never to raw HTML.
    const body = engine
      ? await renderUntrustedInline(c.content, engine as never)
      : escapeHtml(c.content).replace(/\n/g, '<br>');
    parts.push(`<div class="comment" id="comment-${escapeHtml(c.id)}">`);
    parts.push('  <div class="comment-meta">');
    parts.push(`    <span class="comment-author">${escapeHtml(c.authorDisplayName)}</span>`);
    parts.push(`    <span class="comment-date">${formatDate(c.createdAt)}</span>`);
    if (canDelete) {
      parts.push(`    <button class="comment-delete-btn btn btn-sm btn-outline-danger ms-2" onclick="ngdpDeleteComment('${escapeHtml(pageUuid)}','${escapeHtml(c.id)}')">Delete</button>`);
    }
    parts.push('  </div>');
    parts.push(`  <div class="comment-body">${body}</div>`);
    parts.push('</div>');
  }
  parts.push('</div>');
  return parts.join('\n');
}

const CommentsPlugin: SimplePlugin = {
  name: 'CommentsPlugin',
  description: 'Displays page comments and a submission form for authenticated users',
  author: 'ngdpbase',
  version: '1.0.0',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const engine = context.engine;
    if (!engine) return '';

    const commentManager = engine.getManager('CommentManager') as CommentManager | undefined;
    if (!commentManager || !commentManager.isEnabled()) return '';

    const pageMetadata = context.pageMetadata as { uuid?: string } | undefined;
    const pageUuid = pageMetadata?.uuid;
    if (!pageUuid) return '';

    const userContext = context.userContext as {
      isAuthenticated?: boolean;
      username?: string;
      displayName?: string;
      name?: string;
      roles?: string[];
    } | undefined;

    const isAuthenticated = userContext?.isAuthenticated === true;
    const username = userContext?.username ?? '';
    const displayName = userContext?.displayName ?? userContext?.name ?? username;
    // #1198: the delete-anyone affordance mirrors the route's own gate — policy, not a role name.
    const isAdmin = await subjectMayDo(engine, userContext as never, 'admin-system');

    const noheader = parseBoolParam(params?.['noheader'], false);

    const comments: PageComment[] = await commentManager.getComments(pageUuid);

    const parts: string[] = ['<section class="page-comments">'];
    if (!noheader) parts.push('<h2>Comments</h2>');

    // Wrap the list in a stable container so #590 can swap its innerHTML
    // after add/delete instead of doing a full page reload.
    parts.push(`<div id="comment-list-host" data-page-uuid="${escapeHtml(pageUuid)}">`);
    parts.push(await renderCommentListHtml(comments, isAuthenticated, username, isAdmin, pageUuid, engine));
    parts.push('</div>');

    // #1198: the add-comment form is offered to whoever policy lets comment.
    const canComment = await subjectMayDo(engine, userContext as never, 'comment-create');
    if (canComment) {
      parts.push(`<form class="comment-form mt-3" onsubmit="ngdpSubmitComment(event,'${escapeHtml(pageUuid)}')">`);
      parts.push('  <div class="mb-2">');
      parts.push(`    <label class="form-label">Add a comment (as <strong>${escapeHtml(displayName)}</strong>)</label>`);
      parts.push('    <textarea class="form-control comment-input" name="content" rows="3" maxlength="2000" required placeholder="Write your comment…"></textarea>');
      parts.push('  </div>');
      parts.push('  <button type="submit" class="btn btn-sm btn-primary">Post Comment</button>');
      parts.push('</form>');
      // #590: replace location.reload() with a fetch-and-swap of the
      // #comment-list-host container. Inline onclick/onsubmit handlers in the
      // rendered HTML continue to work after replacement because they call
      // global functions defined here.
      parts.push(`<script>
function ngdpRefreshCommentList(pageUuid) {
  const host = document.getElementById('comment-list-host');
  if (!host) return Promise.resolve();
  return fetch('/api/comments/' + pageUuid + '/html')
    .then(r => r.text())
    .then(html => { host.innerHTML = html; })
    .catch(() => { /* leave stale until next view */ });
}
function ngdpSubmitComment(e, pageUuid) {
  e.preventDefault();
  const input = e.target.querySelector('.comment-input');
  const content = input.value.trim();
  if (!content) return;
  // #727: comment add is state-changing — needs the CSRF token (#663
  // app-wide middleware). csrfFetch injects X-CSRF-Token; without it
  // the POST gets a text/plain 403 that r.json() then chokes on.
  (window.csrfFetch || fetch)('/api/comments/' + pageUuid, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  }).then(r => r.json()).then(data => {
    if (data.success) { input.value = ''; return ngdpRefreshCommentList(pageUuid); }
    alert(data.error || 'Failed to post comment.');
  }).catch(() => alert('Failed to post comment.'));
}
function ngdpDeleteComment(pageUuid, commentId) {
  if (!confirm('Delete this comment?')) return;
  // #727: comment delete is state-changing — needs the CSRF token.
  (window.csrfFetch || fetch)('/api/comments/' + pageUuid + '/' + commentId, {
    method: 'DELETE'
  }).then(r => r.json()).then(data => {
    if (data.success) return ngdpRefreshCommentList(pageUuid);
    alert(data.error || 'Failed to delete comment.');
  }).catch(() => alert('Failed to delete comment.'));
}
</script>`);
    } else {
      parts.push('<p class="comment-login-prompt mt-2"><em>You must be logged in to post a comment.</em></p>');
    }

    parts.push('</section>');
    return parts.join('\n');
  }
};

export default CommentsPlugin;
