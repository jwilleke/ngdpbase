/* Journal reminder — show the reminder time only while the reminder is on.
 * A checkbox with data-journal-shows="<id>" shows or hides that element.
 * A file, not an inline handler, so it runs under a strict script policy (#1706). */
(function () {
  'use strict';
  document.querySelectorAll('input[data-journal-shows]').forEach(function (box) {
    box.addEventListener('change', function () {
      var row = document.getElementById(box.dataset.journalShows);
      if (row) row.style.display = box.checked ? '' : 'none';
    });
  });
}());
