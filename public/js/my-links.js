/**
 * My Links — pinned item management.
 *
 * Items can be either wiki pages (pageName + title) or app-route URLs
 * (url + title), since #785. The legacy addPinnedPage / removePinnedPage
 * remain as thin wrappers around the URL-based core so call sites that
 * still pass pageName keep working unchanged.
 */

async function addPinnedItem(url, title, pageName) {
  try {
    const body = pageName
      ? { url, title: title || pageName, pageName }
      : { url, title: title || url };
    const res = await csrfFetch('/api/user/pinned-pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

async function removePinnedItem(ident) {
  try {
    const res = await csrfFetch('/api/user/pinned-pages/' + encodeURIComponent(ident), {
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

// Legacy wrappers — kept for back-compat with templates and plugins that
// still pass pageName directly. They derive the URL on the client and route
// through the URL-based core. Safe to remove once all call sites migrate.
async function addPinnedPage(pageName, title) {
  return addPinnedItem('/view/' + encodeURIComponent(pageName), title || pageName, pageName);
}

async function removePinnedPage(pageName) {
  return removePinnedItem(pageName);
}
