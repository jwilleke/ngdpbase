# @jwilleke/media-date

Reads a capture date from a media filename. This is the one implementation: ngdpbase imports it, and mjs-media-handling keeps a built copy of it and calls its command line. It is not published to npm. It only looks at the name, so it needs no server, no files and no network.

## Fake values

A date needs every part, and a name often has only some. Each missing part gets one fixed value, so a filled date is always recognizable.

| Missing part | Value written |
|---|---|
| Month | `06` |
| Day | `15` |
| Time | `11:59:00` |

| Name | Name gives | Date |
|---|---|---|
| `2010-05-24-045250-Ireland.m2ts` | Date and time | `2010-05-24 04:52:50` |
| `VID-20261003-WA0002.mp4` | Date | `2026-10-03 11:59:00` |
| `2023-04-letter.tif` | Year, month | `2023-04-15 11:59:00` |
| `scan-1990.jpg` | Year | `1990-06-15 11:59:00` |

These values are invented. Mid-month and mid-year put a file near its true position when sorted, and a time near noon keeps it on the same day if a time zone is applied. A photograph really taken at exactly 11:59:00 cannot be told apart from a filled one by the date alone, so callers that need to know use `parseFilenameDate`, which returns null for each part the name did not carry.

## What is read

Rules run in this order, and the first valid match wins.

| Rule | Example |
|---|---|
| Year-month-day, optional time | `2026-04-03_14.00.00.jpg` |
| Compact date and time | `PXL_20260113_123414708.jpg` |
| 8 or 14 digits | `20090420123754.m2ts`, `VID-20261003-WA0002.mp4` |
| Numeric date, always US month-day-year | `Back - 12-11-2024.jpg` is December 11 |
| Month name, optional time | `Drive - May 29, 2025, 15_11_57.png` |
| Unix milliseconds or seconds, UTC day | `1788030775012_1.mp4`, `1648245911.jpg` |
| Year and month, separated | `2023-04-letter.tif` |
| Bare year | `scan-1990.jpg` |

Years run from 1826 to next year. A date must exist on the calendar. A time that is out of range is dropped and the date kept.

## Use

```ts
import { parseDateFromFilename, parseFilenameDate } from '../../packages/media-date/index.js';

parseDateFromFilename('scan-1990.jpg'); // '1990-06-15 11:59:00'
parseFilenameDate('scan-1990.jpg');     // { year: 1990, month: null, day: null, time: null, source: 'filename:YYYY' }
```

From another language, run the command. It prints one JSON object per name.

```sh
node cli.js 'scan-1990.jpg'
```

## Updating mjs-media-handling

`npm run build:media-date-package` writes `index.js` and `cli.js` to `packages/media-date/dist`. They have no dependencies and need only Node. Copy them into mjs-media-handling, with `package.json`, when you want its rules updated. ngdpbase does not need to be running, and the copy keeps working if ngdpbase is stopped or removed.
