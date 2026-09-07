/**
 * WikiStatFilters — the client half of the canonical summary-stat filter bar.
 *
 * The markup is the contract (#1303, same split as WikiPagination): a bar
 * emitted by `formatStatFilters()` carries everything this needs, so a surface
 * gets the behaviour by rendering the markup and calling nothing.
 *
 * Cards with an href are server-side filters and are left completely alone —
 * they are ordinary links. This wires only the cards carrying
 * `data-stat-match`, which are correct on a list where every row is loaded.
 *
 * Two ways to consume a click, and a page picks one:
 *
 *   1. Put `data-stat-rows="<selector>"` on the bar and this hides the rows
 *      that do not match. That is the whole integration for a simple list.
 *
 *   2. Omit it and listen for the `wiki-stat-filter` event on the bar. A page
 *      with its own search box and selects — /admin/users — owns the compound
 *      filter, and a bar that also hid rows would fight it.
 *
 * The active key is readable at any time from the bar's `data-stat-current`.
 */
(function (global) {
    'use strict';

    var WikiStatFilters = {};

    function cardsOf(bar) {
        return Array.prototype.slice.call(bar.querySelectorAll('[data-stat-match], [data-stat-clear]'));
    }

    /**
     * Dim what is not selected and outline what is. The visual language is the
     * one /admin/users already taught its users, kept exactly.
     */
    function paint(bar) {
        var current = bar.getAttribute('data-stat-current');
        cardsOf(bar).forEach(function (card) {
            var mine = card.getAttribute('data-stat-match');
            // The clearing card reads as selected when nothing is filtered,
            // which is what "Total" means: everything is showing.
            var selected = mine ? current === mine : !current;
            card.style.opacity = (!current || selected) ? '1' : '0.5';
            card.style.outline = mine && selected ? '3px solid white' : '';
            card.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    }

    /**
     * Hide the rows a `attr=value` match excludes, reading `data-<attr>` off
     * each row. Only runs when the bar names its rows.
     */
    function applyRows(bar) {
        var selector = bar.getAttribute('data-stat-rows');
        if (!selector) return;

        var current = bar.getAttribute('data-stat-current');
        var parts = current ? current.split('=') : null;
        var attr = parts ? parts[0] : null;
        var wanted = parts ? parts.slice(1).join('=') : null;

        Array.prototype.forEach.call(document.querySelectorAll(selector), function (row) {
            var show = !attr || row.getAttribute('data-' + attr) === wanted;
            row.style.display = show ? '' : 'none';
        });
    }

    /**
     * Select a filter, or clear it by selecting the one already active — the
     * toggle-off behaviour /admin/users has today.
     *
     * @param {Element} bar   - The bar element.
     * @param {string|null} match - `attr=value`, or null to clear.
     */
    WikiStatFilters.select = function (bar, match) {
        var current = bar.getAttribute('data-stat-current');
        if (!match || current === match) {
            bar.removeAttribute('data-stat-current');
        } else {
            bar.setAttribute('data-stat-current', match);
        }
        paint(bar);
        applyRows(bar);
        bar.dispatchEvent(new CustomEvent('wiki-stat-filter', {
            bubbles: true,
            detail: { match: bar.getAttribute('data-stat-current') }
        }));
    };

    /** The filter in effect on a bar, or null. */
    WikiStatFilters.current = function (bar) {
        return bar ? bar.getAttribute('data-stat-current') : null;
    };

    /**
     * Wire every stat bar in a subtree. Idempotent: a bar already wired is
     * skipped, so calling this again after rendering more markup is safe.
     *
     * @param {Document|Element} [root=document] - Subtree to scan.
     */
    WikiStatFilters.enhance = function (root) {
        var scope = root || document;
        Array.prototype.forEach.call(scope.querySelectorAll('[data-stat-filters]'), function (bar) {
            if (bar.getAttribute('data-stat-wired')) return;
            bar.setAttribute('data-stat-wired', '1');

            cardsOf(bar).forEach(function (card) {
                card.style.cursor = 'pointer';
                card.addEventListener('click', function () {
                    WikiStatFilters.select(bar, card.getAttribute('data-stat-match'));
                });
                // role="button" promises Enter and Space work. Without this the
                // promise is decorative for anyone not using a mouse.
                card.addEventListener('keydown', function (event) {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    WikiStatFilters.select(bar, card.getAttribute('data-stat-match'));
                });
            });

            paint(bar);
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { WikiStatFilters.enhance(); });
    } else {
        WikiStatFilters.enhance();
    }

    global.WikiStatFilters = WikiStatFilters;
})(window);
