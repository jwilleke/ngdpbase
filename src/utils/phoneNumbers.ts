/**
 * Phone numbers and countries for identity records (#2073).
 *
 * Phones are stored in E.164 (`+14155552671`), the extension apart. What a
 * user types is read with the country chosen beside it; a number typed with
 * a leading `+` keeps its own country code. Parsing and the per-country
 * rules are libphonenumber-js's (Google's libphonenumber metadata, kept
 * current by its maintainers); country names are the runtime's own
 * (`Intl.DisplayNames`), so no list is kept here.
 */

import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/** A country the dropdowns offer: its ISO 3166-1 alpha-2 code, its name, and its calling code. */
export interface CountryOption {
  code: string;
  name: string;
  callingCode: string;
}

let options: CountryOption[] | null = null;

/** Every country libphonenumber knows, by English name. Built once. */
export function countryOptions(): CountryOption[] {
  if (options) return options;
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  options = getCountries()
    .map((code) => ({ code, name: names.of(code) ?? code, callingCode: getCountryCallingCode(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return options;
}

/** `code` (any case) when it is a country the dropdowns offer, else null. */
export function knownCountry(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const upper = code.trim().toUpperCase();
  return (getCountries() as string[]).includes(upper) ? upper : null;
}

/**
 * What the user typed, as E.164 with any extension typed after it
 * (`x12`, `ext. 12`), read with `country` unless it starts with `+`.
 * Null when it is not a valid number.
 */
export function toE164(typed: string, country: string): { telephone: string; extension: string | null } | null {
  const parsed = parsePhoneNumberFromString(typed, country as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  return { telephone: parsed.number, extension: parsed.ext ?? null };
}

/**
 * A stored number shown back: its national form and its country, for the
 * dropdown. A value that is not E.164 (written before #2073, or by an
 * add-on) is shown as stored, with `fallback` as its country.
 */
export function localForm(stored: string, fallback: string): { number: string; country: string } {
  const parsed = stored.startsWith('+') ? parsePhoneNumberFromString(stored) : undefined;
  if (!parsed?.country) return { number: stored, country: fallback };
  return { number: parsed.formatNational(), country: parsed.country };
}
