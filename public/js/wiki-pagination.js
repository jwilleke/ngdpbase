/**
 * WikiPagination — shared pagination utilities.
 *
 * Provides three building blocks that can be combined for any paginated view:
 *
 *   WikiPagination.renderNav(containerEl, currentPage, totalPages, onNavigate)
 *     Renders a Bootstrap pagination <ul> into containerEl and wires click handlers.
 *     onNavigate(page) is called with the 1-based target page number.
 *
 *   WikiPagination.attachKeyboard(onPrev, onNext)
 *     Binds ArrowLeft / ArrowRight on the document. Skips when focus is in an input,
 *     textarea, select, or contenteditable element.
 *     onPrev / onNext are zero-argument functions; pass null to disable a direction.
 *
 *   WikiPagination.attachSwipe(el, onPrev, onNext)
 *     Binds touch-swipe on el (pass document.body for full-page swipe).
 *     Fires when the horizontal displacement > 50 px and > 1.5× the vertical displacement.
 *     Swipe right → onPrev, swipe left → onNext.
 *
 * Usage — client-side paginated list (e.g. browse-attachments):
 *
 *   var paginationEl = document.getElementById('pagination');
 *
 *   function goTo(page) {
 *     currentPage = page;
 *     render();
 *   }
 *
 *   // Inside render():
 *   WikiPagination.renderNav(paginationEl, currentPage, totalPages, goTo);
 *
 *   // Once, after first render:
 *   WikiPagination.attachKeyboard(
 *     function() { if (currentPage > 1) goTo(currentPage - 1); },
 *     function() { if (currentPage < totalPages) goTo(currentPage + 1); }
 *   );
 *   WikiPagination.attachSwipe(document.body,
 *     function() { if (currentPage > 1) goTo(currentPage - 1); },
 *     function() { if (currentPage < totalPages) goTo(currentPage + 1); }
 *   );
 *
 * Usage — server-side URL navigation (e.g. /search media tab):
 *
 *   <div data-pagination
 *        data-prev-url="/search?tab=media&mediaPage=2"
 *        data-next-url="/search?tab=media&mediaPage=4">
 *
 *   WikiPagination.attachKeyboard(
 *     WikiPagination.urlNav('data-prev-url', '[data-pagination]'),
 *     WikiPagination.urlNav('data-next-url', '[data-pagination]')
 *   );
 *   WikiPagination.attachSwipe(document.body,
 *     WikiPagination.urlNav('data-prev-url', '[data-pagination]'),
 *     WikiPagination.urlNav('data-next-url', '[data-pagination]')
 *   );
 */
(function (global) {
    'use strict';

    var WikiPagination = {};

    /**
     * Render a Bootstrap pagination <ul> inside containerEl.
     *
     * Shows up to 7 page numbers in a sliding window around currentPage, with
     * leading/trailing ellipsis when the window doesn't reach the first/last page.
     */
    WikiPagination.renderNav = function (containerEl, currentPage, totalPages, onNavigate) {
        if (!containerEl) return;
        containerEl.innerHTML = '';
        if (totalPages <= 1) return;

        var items = [];

        // Previous
        items.push(_navItem(currentPage <= 1, '<i class="fas fa-chevron-left"></i>', currentPage - 1, 'Previous'));

        // Sliding window
        var windowSize = 7;
        var half = Math.floor(windowSize / 2);
        var startPage = Math.max(1, currentPage - half);
        var endPage = Math.min(totalPages, startPage + windowSize - 1);
        if (endPage - startPage < windowSize - 1) {
            startPage = Math.max(1, endPage - windowSize + 1);
        }

        if (startPage > 1) {
            items.push(_navItem(false, '1', 1));
            if (startPage > 2) items.push(_ellipsis());
        }
        for (var p = startPage; p <= endPage; p++) {
            items.push(_navItem(false, String(p), p, null, p === currentPage));
        }
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) items.push(_ellipsis());
            items.push(_navItem(false, String(totalPages), totalPages));
        }

        // Next
        items.push(_navItem(currentPage >= totalPages, '<i class="fas fa-chevron-right"></i>', currentPage + 1, 'Next'));

        var ul = document.createElement('ul');
        ul.className = 'pagination pagination-sm mb-0';
        // #1300: the marker is the contract, not the tag. A server-emitted
        // pager is a <nav> and this one is a <ul>, and one selector finds both.
        // No prev/next URLs here: this pager navigates by callback, and their
        // absence is how enhance() knows not to claim the arrow keys from it.
        ul.setAttribute('data-pagination', '');
        ul.setAttribute('data-current-page', String(currentPage));
        ul.setAttribute('data-total-pages', String(totalPages));

        items.forEach(function (item) {
            ul.appendChild(item.el);
            if (item.page !== null && !item.disabled && !item.active) {
                item.el.addEventListener('click', function (e) {
                    e.preventDefault();
                    onNavigate(item.page);
                });
            }
        });

        containerEl.appendChild(ul);
    };

    function _navItem(disabled, html, page, ariaLabel, active) {
        var li = document.createElement('li');
        li.className = 'page-item' + (disabled ? ' disabled' : '') + (active ? ' active' : '');
        var inner = document.createElement(disabled || active ? 'span' : 'a');
        inner.className = 'page-link';
        if (!disabled && !active) inner.href = '#';
        if (ariaLabel) inner.setAttribute('aria-label', ariaLabel);
        inner.innerHTML = html;
        li.appendChild(inner);
        return { el: li, page: page, disabled: disabled, active: active };
    }

    function _ellipsis() {
        var li = document.createElement('li');
        li.className = 'page-item disabled';
        li.innerHTML = '<span class="page-link">&hellip;</span>';
        return { el: li, page: null, disabled: true, active: false };
    }

    /**
     * Whether something has already claimed the page's arrow keys.
     *
     * #1300: these bind on `document`, so a page carrying two pagers — the
     * common top-and-bottom pair — would advance two pages per keypress. First
     * binder wins, which is also what keeps enhance() from overriding a page
     * that wires its own callbacks.
     */
    var _keyboardBound = false;
    var _swipeBound = false;

    /**
     * Bind ArrowLeft / ArrowRight keyboard shortcuts.
     * Skips when focus is inside an interactive text element.
     * Only the first call on a page takes effect.
     */
    WikiPagination.attachKeyboard = function (onPrev, onNext) {
        if (_keyboardBound) return;
        _keyboardBound = true;
        document.addEventListener('keydown', function (e) {
            if (_isTyping(e.target)) return;
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            if (e.key === 'ArrowLeft'  && onPrev) onPrev();
            if (e.key === 'ArrowRight' && onNext) onNext();
        });
    };

    /**
     * Bind touch-swipe navigation on el.
     * Swipe right → onPrev, swipe left → onNext.
     */
    WikiPagination.attachSwipe = function (el, onPrev, onNext) {
        if (_swipeBound) return;
        _swipeBound = true;
        var _sx = 0, _sy = 0;
        el.addEventListener('touchstart', function (e) {
            _sx = e.changedTouches[0].screenX;
            _sy = e.changedTouches[0].screenY;
        }, { passive: true });
        el.addEventListener('touchend', function (e) {
            var dx = e.changedTouches[0].screenX - _sx;
            var dy = e.changedTouches[0].screenY - _sy;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                if (dx < 0 && onNext) onNext();
                if (dx > 0 && onPrev) onPrev();
            }
        }, { passive: true });
    };

    /**
     * Returns a function that reads a URL from data-attribute on a selector and navigates to it.
     * Useful for wiring keyboard/swipe to server-side paginated pages.
     *
     * Example:
     *   WikiPagination.urlNav('data-prev-url', '[data-pagination]')
     *   // → reads document.querySelector('[data-pagination]').dataset.prevUrl and navigates
     */
    WikiPagination.urlNav = function (dataAttr, selector) {
        return function () {
            var el = document.querySelector(selector);
            if (!el) return;
            var url = el.getAttribute(dataAttr);
            if (url) window.location.href = url;
        };
    };

    function _isTyping(el) {
        if (!el) return false;
        var tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
               el.isContentEditable;
    }

    /**
     * Give every canonical pager on the page its keyboard and swipe behaviour.
     *
     * A pager emitted by `formatPaginationNav` carries its prev/next URLs in
     * the markup, so there is nothing for the page to wire: clicks are real
     * links and work already, and this adds the two affordances that need
     * JavaScript. Runs automatically on DOMContentLoaded — a surface gets the
     * whole control by emitting the markup and nothing else.
     *
     * Pagers without URLs are left alone. Those are the callback-driven ones
     * built by renderNav, which already own their navigation.
     *
     * @param {Document|Element} [root=document] - Subtree to scan.
     */
    WikiPagination.enhance = function (root) {
        var scope = root || document;
        var pagers = scope.querySelectorAll('[data-pagination][data-prev-url], [data-pagination][data-next-url]');
        if (!pagers.length) return;

        // Bind against the first URL-driven pager. A page's pagers are the same
        // control repeated, so the first one's URLs are every one's URLs.
        var pager = pagers[0];
        var prevUrl = pager.getAttribute('data-prev-url');
        var nextUrl = pager.getAttribute('data-next-url');

        var goPrev = prevUrl ? function () { global.location.href = prevUrl; } : null;
        var goNext = nextUrl ? function () { global.location.href = nextUrl; } : null;

        WikiPagination.attachKeyboard(goPrev, goNext);
        WikiPagination.attachSwipe(document.body, goPrev, goNext);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { WikiPagination.enhance(); });
    } else {
        WikiPagination.enhance();
    }

    global.WikiPagination = WikiPagination;
})(window);
