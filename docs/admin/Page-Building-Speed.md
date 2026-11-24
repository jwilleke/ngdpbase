# Page building speed

For operators: how fast the site turns page text into the page people read, and how to see it. The design is issue [#2468](https://github.com/jwilleke/ngdpbase/issues/2468).

## What it does

While pages are being viewed, the site checks itself once a minute and keeps each check. __Admin → Page building speed__ (`/admin/parser-performance`, a button next to Logs on the dashboard) sums those checks for the last hour, the last 24 hours, the last 7 days and the last 30 days.

It opens for an account that passes the `admin-read` permission check (`admin-system` also passes). Anyone else gets "Access Denied". The page only reads; it changes no setting and removes no file.

## Reading the page

There is one table for each of three measures:

- __Page build time__: milliseconds to build a page that was not already stored. The limit is `ngdpbase.markup.performance.alert-thresholds.parse-time`.
- __Pages from stored copies__: the share of pages served from a stored copy, in percent. Lower than the limit is flagged (`...alert-thresholds.cache-hit-ratio`).
- __Pages that failed to build__: in percent. Higher than the limit is flagged (`...alert-thresholds.error-rate`).

Each table has these rows for every period:

| Row | Meaning |
| --- | --- |
| Typical | The middle value: half the checks were under it. |
| Slowest 1 in 20 | 19 of 20 checks stayed under it. |
| Slowest | The worst check. |
| Average | The plain average. |
| Checks counted | How many checks had a number for this measure. |

A period with no checks says "No checks recorded in this period yet." A minute in which no page was built has no check, so a quiet site has gaps.

## Earlier warnings

Before the site kept every check, it saved a notification only for the minutes when a number went over its limit. When it starts, it copies the numbers from those notifications into `legacy-alerts.json` in the history folder and then deletes the notifications. If the page has any, it shows them in a table of their own, "Earlier warnings (over-limit samples only)". They show how bad the slow minutes were, not how the site did overall. If a restart interrupts the copy, the next start finishes it; nothing is copied twice or lost.

## "This site is not keeping these checks"

The checks are kept in the folder set by `ngdpbase.markup.performance.history.dir` (default `${FAST_STORAGE}/parser-performance`). The page says this when there is no folder to keep them in. Files older than 30 days are removed by the site. The folder rebuilds itself and is not part of a backup, but `legacy-alerts.json` in it is the only copy of the earlier warnings, so copy it if you want to keep them.

See also: [MarkupParser API](../api/MarkupParser-API.md#page-building-check-and-history-2468).
