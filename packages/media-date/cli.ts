#!/usr/bin/env node
/**
 * `media-date <filename>...` prints one JSON object per name, in order, for
 * callers that are not JavaScript. `date` is null when the name gives none.
 */
import { fillFilenameDate, parseFilenameDate } from './index.js';

for (const name of process.argv.slice(2)) {
  const parsed = parseFilenameDate(name);
  console.log(JSON.stringify({ name, date: parsed && fillFilenameDate(parsed), parsed }));
}
