/**
 * The /profile "Contact details" card (#2073): what it shows from a user's
 * own identity record and account, what its form posts, and the label of
 * each box. The rules (E.164, merging, checks) are IdentityManager's
 * (`updateContactDetails`) and UserManager's (name and email); this is only
 * the form's shape, kept in one place for the view and the route.
 */

import type { AddressInput, ContactDetailsInput, Person } from '../types/Person.js';
import type { PostalAddress } from '../types/Organization.js';
import { countryOptions, localForm, type CountryOption } from '../utils/phoneNumbers.js';
import { languageName } from '../utils/languages.js';

/**
 * The phones on the card: the form's field prefix, the label, and the
 * `contactType` of its ContactPoint — the kinds the association and
 * accommodation add-ons write too (a work phone is `business`).
 */
export const PROFILE_PHONES = [
  { key: 'home', label: 'Home phone', contactType: 'home', autocomplete: 'home tel-national' },
  { key: 'mobile', label: 'Mobile phone', contactType: 'mobile', autocomplete: 'mobile tel-national' },
  { key: 'work', label: 'Work phone', contactType: 'business', autocomplete: 'work tel-national' },
  { key: 'other', label: 'Other phone', contactType: 'other', autocomplete: 'tel-national' }
] as const;

/** The two addresses on the card: the home address (`address`) and the mailing address. */
export const PROFILE_ADDRESSES = [
  { key: 'address', label: 'Home address', autocomplete: 'section-home' },
  { key: 'mailing', label: 'Mailing address', autocomplete: 'section-mailing' }
] as const;

interface PhoneView { number: string; country: string; extension: string }
interface AddressView { streetAddress: string; addressLocality: string; addressRegion: string; postalCode: string; country: string }

/** What the card shows. */
export interface ContactDetailsCard {
  displayName: string;
  email: string;
  givenName: string;
  familyName: string;
  phones: Array<{ key: string; label: string; autocomplete: string } & PhoneView>;
  emergency: { name: string; email: string } & PhoneView;
  addresses: Array<{ key: string; label: string; autocomplete: string } & AddressView>;
  languages: string;
  image: string;
  links: string;
  countries: CountryOption[];
}

const s = (v: unknown): string => (typeof v === 'string' ? v : '');

function phoneView(entry: Record<string, unknown>, fallback: string): PhoneView {
  const stored = s(entry.telephone);
  const shown = stored ? localForm(stored, fallback) : { number: '', country: fallback };
  return { ...shown, extension: s(entry.extension) };
}

function addressView(address: Partial<PostalAddress> | undefined, fallback: string): AddressView {
  return {
    streetAddress: s(address?.streetAddress),
    addressLocality: s(address?.addressLocality),
    addressRegion: s(address?.addressRegion),
    postalCode: s(address?.postalCode),
    country: s(address?.addressCountry) || fallback
  };
}

/** The card's values from the user's identity record and account. */
export function contactDetailsCard(record: Person | null, account: { displayName?: string; email?: string } | null | undefined, fallback: string): ContactDetailsCard {
  const entries = (record?.contactPoint ?? []) as unknown as Array<Record<string, unknown>>;
  const find = (type: string, contactType: string): Record<string, unknown> =>
    entries.find((c) => c['@type'] === type && c.contactType === contactType) ?? {};
  const emergency = find('ContactPoint', 'emergency');
  return {
    displayName: s(account?.displayName),
    email: s(account?.email),
    givenName: s(record?.givenName),
    familyName: s(record?.familyName),
    phones: PROFILE_PHONES.map((p) => ({ key: p.key, label: p.label, autocomplete: p.autocomplete, ...phoneView(find('ContactPoint', p.contactType), fallback) })),
    emergency: { name: s(emergency.name), email: s(emergency.email), ...phoneView(emergency, fallback) },
    addresses: [
      { ...PROFILE_ADDRESSES[0], ...addressView(record?.address, fallback) },
      { ...PROFILE_ADDRESSES[1], ...addressView(find('PostalAddress', 'mailing'), fallback) }
    ],
    languages: (record?.knowsLanguage ?? []).map(languageName).join(', '),
    image: s(record?.image),
    links: (record?.sameAs ?? []).join('\n'),
    countries: countryOptions()
  };
}

/** What the form posted, as IdentityManager takes it; the name and email go to the account. */
export function contactDetailsFromForm(body: Record<string, unknown>): { displayName: string; email: string; details: ContactDetailsInput } {
  const text = (name: string): string => s(body[name]);
  const address = (key: string): AddressInput => ({
    streetAddress: text(`${key}Street`),
    addressLocality: text(`${key}City`),
    addressRegion: text(`${key}Region`),
    postalCode: text(`${key}PostalCode`),
    addressCountry: text(`${key}Country`)
  });
  return {
    displayName: text('displayName').trim(),
    email: text('email').trim(),
    details: {
      givenName: text('givenName'),
      familyName: text('familyName'),
      phones: PROFILE_PHONES.map((p) => ({
        contactType: p.contactType,
        number: text(`${p.key}Phone`),
        country: text(`${p.key}PhoneCountry`),
        extension: text(`${p.key}PhoneExt`)
      })),
      emergency: {
        name: text('emergencyName'),
        email: text('emergencyEmail'),
        phone: { number: text('emergencyPhone'), country: text('emergencyPhoneCountry'), extension: text('emergencyPhoneExt') }
      },
      address: address('address'),
      mailing: address('mailing'),
      knowsLanguage: text('languages').split(','),
      image: text('image'),
      sameAs: text('links').split(/\r?\n/)
    }
  };
}

const FIELD_LABELS: Record<string, string> = {
  telephone: 'phone', extension: 'extension', country: 'country', email: 'email', name: 'name',
  streetAddress: 'street', addressLocality: 'city or town', addressRegion: 'state or region', postalCode: 'postal code', addressCountry: 'country'
};

/** The plain label of the box a refused detail is in, e.g. "Mobile phone extension" or "Mailing address postal code". */
export function contactDetailLabel(part: string, field: string): string {
  const phone = PROFILE_PHONES.find((p) => p.contactType === part);
  if (phone) return field === 'telephone' ? phone.label : `${phone.label} ${FIELD_LABELS[field] ?? ''}`.trim();
  if (part === 'emergency') return `Emergency contact ${FIELD_LABELS[field] ?? ''}`.trim();
  const address = PROFILE_ADDRESSES.find((a) => a.key === part);
  if (address) return `${address.label} ${FIELD_LABELS[field] ?? ''}`.trim();
  if (part === 'knowsLanguage') return 'Languages';
  if (part === 'image') return 'Photo';
  if (part === 'sameAs') return 'Links';
  if (part === 'givenName') return 'Given name';
  if (part === 'familyName') return 'Family name';
  return 'Contact details';
}
