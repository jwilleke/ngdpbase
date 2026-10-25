/**
 * #2073 — what the /profile "Contact details" card shows: stored E.164
 * phones in local form with their own country, the configured default
 * country where nothing is stored, languages by name.
 *
 * Sabotaged once (2026-10-25), and watched go red:
 * - phones shown as stored (E.164) instead of in local form → "shows phones
 *   in local form" went red;
 * - the default country ignored for an empty phone → "uses the default
 *   country" went red.
 */

import { contactDetailsCard, contactDetailsFromForm } from '../profileContactDetails';
import type { Person } from '../../types/Person';

const record = (extra: Partial<Person>): Person => ({ '@context': 'https://schema.org', '@type': 'Person', '@id': 'urn:uuid:1', identifier: 'pat', ...extra });

describe('the Contact details card (#2073)', () => {
  test('shows phones in local form with their own country, the extension apart, and languages by name', () => {
    const card = contactDetailsCard(record({
      givenName: 'Pat',
      contactPoint: [
        { '@type': 'ContactPoint', contactType: 'home', telephone: '+14155552671' },
        { '@type': 'ContactPoint', contactType: 'business', telephone: '+442079460958', extension: '12' },
        { '@type': 'ContactPoint', contactType: 'other', telephone: '555-1234 (typed by an add-on)' },
        { '@type': 'ContactPoint', contactType: 'emergency', name: 'Sam', telephone: '+14155552672' },
        { '@type': 'PostalAddress', contactType: 'mailing', streetAddress: 'PO Box 9', addressCountry: 'CA' }
      ],
      knowsLanguage: ['en', 'es']
    }), { displayName: 'Pat D', email: 'pat@example.org' }, 'US');
    expect(card).toMatchObject({ displayName: 'Pat D', email: 'pat@example.org', givenName: 'Pat', languages: 'English, Spanish' });
    expect(card.phones.map((p) => [p.label, p.number, p.country, p.extension])).toEqual([
      ['Home phone', '(415) 555-2671', 'US', ''],
      ['Mobile phone', '', 'US', ''],
      ['Work phone', '020 7946 0958', 'GB', '12'],
      ['Other phone', '555-1234 (typed by an add-on)', 'US', '']
    ]);
    expect(card.emergency).toMatchObject({ name: 'Sam', number: '(415) 555-2672', country: 'US' });
    expect(card.addresses.map((a) => [a.label, a.streetAddress, a.country])).toEqual([['Home address', '', 'US'], ['Mailing address', 'PO Box 9', 'CA']]);
    expect(card.countries.find((c) => c.code === 'GB')).toEqual({ code: 'GB', name: 'United Kingdom', callingCode: '44' });
  });

  test('uses the default country where nothing is stored', () => {
    const card = contactDetailsCard(null, null, 'GB');
    expect(new Set([...card.phones.map((p) => p.country), card.emergency.country, ...card.addresses.map((a) => a.country)])).toEqual(new Set(['GB']));
  });

  test('reads the form: name and email for the account, the rest for the identity record', () => {
    const { displayName, email, details } = contactDetailsFromForm({ displayName: ' Pat ', email: ' pat@example.org ', workPhone: '1', workPhoneCountry: 'GB', workPhoneExt: '2', languages: 'en,fr', links: 'a\nb' });
    expect({ displayName, email }).toEqual({ displayName: 'Pat', email: 'pat@example.org' });
    expect(details.phones?.[2]).toEqual({ contactType: 'business', number: '1', country: 'GB', extension: '2' });
    expect(details.knowsLanguage).toEqual(['en', 'fr']);
    expect(details.sameAs).toEqual(['a', 'b']);
  });
});
