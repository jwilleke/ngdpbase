# Page building speed

For operators: how fast the site turns page text into the page people read, and how to see it. The design is issue [#2468](https://github.com/jwilleke/ngdpbase/issues/2468).

## What it does

While pages are being viewed, the site checks itself once a minute and keeps each check. __Admin → Page building speed__ (`/admin/parser-performance`, a button next to Logs on the dashboard) sums those checks for the last hour, the last 24 hours, the last 7 days and the last 30 days.

It opens for an account that passes the `admin-read` permission check (`admin-system` also passes), and the dashboard button is shown to both. Anyone else gets "Access Denied". The page only reads; it changes no setting and removes no file.

## Reading the page

There is one table for each of three measures:

- __Page build time (ms)__: milliseconds to build a page that was not already stored. The limit is `ngdpbase.markup.performance.alert-thresholds.parse-time`; slower is too slow.
- __Pages from stored copies (%)__: the share of pages served from a stored copy. Below the limit is too low (`...alert-thresholds.cache-hit-ratio`).
- __Pages that failed to build (%)__: above the limit is too high (`...alert-thresholds.error-rate`).

The page marks no cell: the notes say which side of the limit is bad.

The first view is a one-sentence intro; what the rows mean is in a closed "What Typical, Slowest 1 in 20 and Slowest mean" section. Each table has these rows for every period, and each column heading says how many checks the period holds:

| Row | Meaning |
| --- | --- |
| Typical | The middle value: half the checks were under it. |
| Slowest 1 in 20 | 19 of 20 checks stayed under it. |
| Slowest | The worst check. |
| Average | The plain average. |

A period with no checks says "No checks in this period." A table with nothing at all says "No checks recorded yet." and, when there are no checks anywhere, the page shows that one line and no tables. When a table's own count of checks with a number is lower than the period's, it adds a row "Checks with this number". A minute in which no page was built has no check, so a quiet site has gaps.

## Earlier warnings

Before the site kept every check, it saved a notification only for the minutes when a number went over its limit. When it starts, it copies the numbers from those notifications into `legacy-alerts.json` in the history folder and then deletes the notifications. If the page has any, it shows them in a table of their own, "Earlier warnings (only checks over the limit)". They show how bad the slow checks were, not how the site did overall. The share served from stored copies and the share that failed were totals since start-up, so they are not comparable with the per-minute tables, and the page says so. If a restart interrupts the copy, the next start finishes it; nothing is copied twice or lost.

## "This site is not keeping these checks"

The checks are kept in the folder set by `ngdpbase.markup.performance.history.dir` (default `${FAST_STORAGE}/parser-performance`). The page says this, with the step to take (set that folder in Admin → Configuration, then restart), and shows no tables, when there is no folder to keep them in or the folder could not be made when the site started. Files older than 30 days are removed by the site. The folder rebuilds itself and is not part of a backup, but `legacy-alerts.json` in it is the only copy of the earlier warnings, so copy it if you want to keep them.

See also: [MarkupParser API](../api/MarkupParser-API.md#page-building-check-and-history-2468).
