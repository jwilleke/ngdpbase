/**
 * Text an event carries that ends up in a line-based format (#2546).
 *
 * The .ics feed is made of lines, so a carriage return or line feed in an event's
 * text would start a line of the writer's choosing (`URL:`, `ATTACH:`, `ATTENDEE:`)
 * for every subscriber. Control characters are refused when an organizer is written,
 * and any control character already stored is dropped when the feed is built.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;
// Everything but the line feed, which a description may hold.
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_LINE_FEED = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]+/g;

/** Whether `value` holds a control character (a line break, NUL, DEL and the like). */
export function hasControlCharacter(value: string): boolean {
  return CONTROL_CHARACTER.test(value);
}

/** One line of text for the feed: every run of control characters becomes one space. */
export function icsLineText(value: string): string {
  return value.replace(CONTROL_CHARACTERS, ' ').trim();
}

/** Multi-line text for the feed: line breaks become `\n` (the feed writer escapes it), other control characters go. */
export function icsBlockText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(CONTROL_EXCEPT_LINE_FEED, ' ');
}
