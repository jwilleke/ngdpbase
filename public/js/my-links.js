/**
 * My Links — pinned page management.
 * Issue #537
 */

async function addPinnedPage(pageName, title) {
  try {
    const res = await csrfFetch('/api/user/pinned-pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageName, title: title || pageName }),
      credentials: 'same-origin'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showTemporaryMessage(err.error || 'Failed to add to My Links', 'error');
      return;
    }
    showTemporaryMessage('Added to My Links', 'success');
    setTimeout(() => location.reload(), 500);
  } catch {
    showTemporaryMessage('Network error', 'error');
  }
}

async function removePinnedPage(pageName) {
  try {
    const res = await csrfFetch('/api/user/pinned-pages/' + encodeURIComponent(pageName), {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    if (!res.ok) {
      showTemporaryMessage('Failed to remove from My Links', 'error');
      return;
    }
    showTemporaryMessage('Removed from My Links', 'success');
    setTimeout(() => location.reload(), 500);
  } catch {
    showTemporaryMessage('Network error', 'error');
  }
}
