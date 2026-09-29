/**
 * #1504 — enabled: false is visibility only. A disabled system-category is
 * never offered, so nobody can choose it; a page that already carries it
 * keeps it and still saves.
 */
import { acceptedSystemCategory } from '../acceptedSystemCategory';

const offered = ['general', 'journal', 'system'];

describe('acceptedSystemCategory (#1504)', () => {
  test('an offered system-category is accepted, returned as offered', () => {
    expect(acceptedSystemCategory('Journal', offered)).toBe('journal');
  });

  test('a page keeps the system-category it already has, even one not offered', () => {
    expect(acceptedSystemCategory('user-profile', offered, 'user-profile')).toBe('user-profile');
    expect(acceptedSystemCategory('User-Profile', offered, 'user-profile')).toBe('user-profile');
  });

  test('nobody can move a page into a system-category that is not offered', () => {
    expect(acceptedSystemCategory('user-profile', offered, 'general')).toBeNull();
    expect(acceptedSystemCategory('user-profile', offered)).toBeNull();
  });

  test('blank or missing is not accepted', () => {
    expect(acceptedSystemCategory('  ', offered, 'general')).toBeNull();
  });
});
