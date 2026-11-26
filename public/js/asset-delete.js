/**
 * AssetDelete — the words for deleting a file from the search picker (#2534).
 *
 *   AssetDelete.confirmText(row)   the confirm box: what is going, and which pages use it
 *   AssetDelete.failureText(status) what to tell the person when the delete was refused
 *
 * `row.usedBy` is { pages, more, hidden } from /api/assets/search: the server
 * has already kept only the pages this person may open (at most ten, the rest
 * counted in `more`) and counted the others in `hidden`. This file only words
 * it; it never decides who may delete (the server does, on every request).
 *
 * Plain text, for window.confirm(): nothing here is HTML.
 */
(function (global) {
    'use strict';

    function plural(n, one, many) { return n === 1 ? one : many; }

    var AssetDelete = {
        confirmText: function (row) {
            var name = row.description || row.filename || row.id;
            var lines = ['Delete "' + name + '"?'];
            var used = row.usedBy;
            var inUse = false;

            if (used) {
                var pages = Array.isArray(used.pages) ? used.pages : [];
                var more = used.more > 0 ? used.more : 0;
                var hidden = used.hidden > 0 ? used.hidden : 0;
                var parts = [];
                if (pages.length > 0) {
                    parts.push('Pages that use it: ' + pages.join(', ') + (more > 0 ? ' and ' + more + ' more' : '') + '.');
                }
                if (hidden > 0) {
                    parts.push((pages.length > 0 ? 'Also used' : 'Used') + ' on ' + hidden + ' ' + plural(hidden, 'page', 'pages') + ' you can\'t open.');
                }
                inUse = parts.length > 0;
                lines.push(inUse ? parts.join(' ') : 'No page uses this file.');
            }

            lines.push(inUse
                ? 'This can\'t be undone, and those pages will show a missing file.'
                : 'This can\'t be undone.');
            return lines.join('\n\n');
        },

        failureText: function (status) {
            if (status === 403) return 'You can\'t delete this file.';
            if (status === 404) return 'This file is already gone.';
            if (status === 503) return 'The file was not deleted because the record of the change could not be saved. Please try again.';
            return 'The file could not be deleted.';
        }
    };

    global.AssetDelete = AssetDelete;
})(window);
