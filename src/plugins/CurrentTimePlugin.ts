/**
 * CurrentTimePlugin - JSPWiki-style plugin for ngdpbase
 * Displays current date/time with customizable formatting
 *
 * Respects user preferences for:
 * - Locale (from profile settings)
 * - Timezone (from profile settings)
 * - Date Format (from profile settings)
 * - Time Format (12h/24h from profile settings)
 *
 * Syntax examples:
 * [{CurrentTimePlugin}] - Uses user preferences
 * [{CurrentTimePlugin format='yyyy-MM-dd HH:mm:ss'}] - Custom format
 * [{CurrentTimePlugin format='hh:mm a'}] - Custom time format
 * [{CurrentTimePlugin format='EEEE, MMMM d, yyyy'}] - Custom date format
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';

interface UserPreferences {
  locale?: string;
  timezone?: string;
  timeFormat?: string;
  dateFormat?: string;
}

interface UserContext {
  preferences?: UserPreferences;
}

interface CurrentTimeContext extends PluginContext {
  userContext?: UserContext;
}

interface CurrentTimeParams extends PluginParams {
  format?: string;
}

/**
 * Format date/time using user preferences
 * @param date - Date to format
 * @param locale - User's locale preference
 * @param timezone - User's timezone preference
 * @param timeFormat - '12h' or '24h'
 * @param _dateFormat - User's date format preference (unused, kept for signature)
 * @returns Formatted date/time
 */
function formatWithUserPreferences(
  date: Date,
  locale: string,
  timezone: string,
  timeFormat: string,
  _dateFormat: string
): string {
  try {
    // Use Intl.DateTimeFormat for proper locale/timezone support
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: timeFormat === '12h'
    };

    const formatter = new Intl.DateTimeFormat(locale, options);
    return formatter.format(date);

  } catch {
    return date.toLocaleString('en-US');
  }
}

/**
 * Format date/time with custom pattern (Java SimpleDateFormat-style)
 * @param date - Date to format
 * @param pattern - Format pattern
 * @param locale - Locale for formatting
 * @param timezone - Timezone for formatting
 * @param hour12 - Use 12-hour format
 * @returns Formatted date/time
 */
function formatWithPattern(
  date: Date,
  pattern: string,
  locale: string,
  timezone: string,
  hour12: boolean
): string {
  try {
    // First, extract and protect quoted strings (literal text)
    const literals: string[] = [];
    const workingPattern = pattern.replace(/'([^']*)'/g, (_match, p1: string) => {
      literals.push(p1);
      return `__LITERAL_${literals.length - 1}__`;
    });

    // Convert date to specified timezone
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: hour12,
      weekday: 'long',
      era: 'short',
      timeZoneName: 'short'
    };

    const formatter = new Intl.DateTimeFormat(locale, options);
    const parts = formatter.formatToParts(date);

    // Extract parts
    const partMap: Record<string, string> = {};
    parts.forEach(part => {
      partMap[part.type] = part.value;
    });

    // Get full month and weekday names
    const monthNameFormatter = new Intl.DateTimeFormat(locale, {
      month: 'long',
      timeZone: timezone
    });
    const monthName = monthNameFormatter.format(date);

    const monthShortFormatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
      timeZone: timezone
    });
    const monthShort = monthShortFormatter.format(date);

    const weekdayNameFormatter = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      timeZone: timezone
    });
    const weekdayName = weekdayNameFormatter.format(date);

    const weekdayShortFormatter = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      timeZone: timezone
    });
    const weekdayShort = weekdayShortFormatter.format(date);

    // Build replacements for common Java SimpleDateFormat patterns
    const year = partMap.year || '';
    const month = partMap.month || '';
    const day = partMap.day || '';
    const hour = partMap.hour || '';
    const minute = partMap.minute || '';
    const second = partMap.second || '';
    const weekday = weekdayName || partMap.weekday || '';
    const dayPeriod = partMap.dayPeriod || ''; // AM/PM
    const era = partMap.era || 'AD'; // Era (AD/BC)
    const timeZoneName = partMap.timeZoneName || timezone; // Timezone abbreviation

    // Replace pattern tokens
    // IMPORTANT: Replace longer patterns first to avoid partial replacements
    let result = workingPattern;

    // Weekday patterns (do these early before other single-letter replacements)
    result = result.replace(/EEEE/g, weekday);           // Full weekday name
    result = result.replace(/EEE/g, weekdayShort);       // Short weekday name

    // Month patterns (longer patterns first)
    result = result.replace(/MMMM/g, monthName);        // Full month name
    result = result.replace(/MMM/g, monthShort);         // Short month name
    result = result.replace(/MM/g, month);               // 2-digit month
    result = result.replace(/\bM\b/g, String(parseInt(month, 10)));  // Month without leading zero (word boundary)

    // Year patterns
    result = result.replace(/yyyy/g, year);
    result = result.replace(/yy/g, year.slice(-2));

    // Day patterns
    result = result.replace(/dd/g, day);                 // 2-digit day
    result = result.replace(/\bd\b/g, String(parseInt(day, 10)));    // Day without leading zero (word boundary)

    // Hour patterns
    result = result.replace(/HH/g, hour);                // 2-digit hour (24h format)
    result = result.replace(/hh/g, hour);                // 2-digit hour (12h format)
    result = result.replace(/\bH\b/g, String(parseInt(hour, 10)));   // Hour without leading zero (word boundary)
    result = result.replace(/\bh\b/g, String(parseInt(hour, 10)));   // Hour without leading zero (word boundary)

    // Minute patterns
    result = result.replace(/mm/g, minute);              // 2-digit minute
    result = result.replace(/\bm\b/g, String(parseInt(minute, 10))); // Minute without leading zero (word boundary)

    // Second patterns
    result = result.replace(/ss/g, second);              // 2-digit second
    result = result.replace(/\bs\b/g, String(parseInt(second, 10))); // Second without leading zero (word boundary)

    // Era pattern (AD/BC)
    result = result.replace(/\bG\b/g, era);              // Era designator

    // Timezone patterns
    result = result.replace(/\bz\b/g, timeZoneName);     // Timezone abbreviation

    // AM/PM pattern (do this last to avoid conflicts)
    result = result.replace(/\ba\b/g, dayPeriod);            // AM/PM marker (word boundary)

    // Restore literal text
    literals.forEach((literal, index) => {
      result = result.replace(`__LITERAL_${index}__`, literal);
    });

    return result;

  } catch {
    // Fallback to basic formatting
    try {
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        hour12: hour12
      };
      return date.toLocaleString(locale, options);
    } catch {
      return date.toLocaleString('en-US');
    }
  }
}

const CurrentTimePlugin: SimplePlugin = {
  name: 'CurrentTimePlugin',
  description: 'Displays current date and time with user locale/timezone preferences',
  author: 'ngdpbase',
  version: '1.0.0',
  // #1751: the time changes with nothing written, so a page showing it is not kept in the page cache.
  volatile: true,

  /**
   * Execute the plugin
   * @param context - Wiki context containing user preferences
   * @param params - Plugin parameters
   * @returns Formatted date/time string
   */
  execute(context: PluginContext, params: PluginParams): string {
    try {
      const ctx = context as CurrentTimeContext;
      const opts = params as CurrentTimeParams;

      // Get user preferences from context
      const userPrefs = ctx?.userContext?.preferences || {};

      // Get locale, timezone, and format preferences
      const locale = userPrefs.locale || 'en-US';
      const timezone = userPrefs.timezone || 'UTC';
      const timeFormat = userPrefs.timeFormat || '12h'; // '12h' or '24h'
      const dateFormat = userPrefs.dateFormat || 'MM/dd/yyyy';

      // Get current time
      const now = new Date();

      // If a custom format is specified, use it
      if (opts.format) {
        return formatWithPattern(now, String(opts.format), locale, timezone, timeFormat === '12h');
      }

      // Otherwise, use user's preferences
      return formatWithUserPreferences(now, locale, timezone, timeFormat, dateFormat);

    } catch {
      return new Date().toLocaleString('en-US');
    }
  },

  /**
   * Plugin initialization (JSPWiki-style)
   * @param _engine - Wiki engine instance
   */
  initialize(_engine: unknown): void {
    // Plugin initialized
  }
};

export default CurrentTimePlugin;
