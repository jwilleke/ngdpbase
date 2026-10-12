/**
 * #1781 — an outside provider's button icon, resolved from its entry's `icon`:
 * an https:// image, a site path, or a Font Awesome name; anything else is
 * refused with a warning naming the entry, and the default shown. Unset, the
 * preset's icon (Google's logo, Microsoft's and Apple's brand icons), else a
 * generic sign-in icon.
 */
import { resolveOutsideProviderIcon } from '../AuthManager';

const GENERIC = { kind: 'fa', className: 'fas fa-right-to-bracket' };

function resolve(icon: unknown, preset?: string): { icon: unknown; warnings: string[] } {
  const warnings: string[] = [];
  return { icon: resolveOutsideProviderIcon('family', icon, preset, m => warnings.push(m)), warnings };
}

describe('resolveOutsideProviderIcon (#1781)', () => {
  describe('accepted forms', () => {
    test.each([
      ['https://idp.example.com/favicon.ico', { kind: 'image', src: 'https://idp.example.com/favicon.ico' }],
      ['/images/family.png', { kind: 'image', src: '/images/family.png' }],
      ['fa-users', { kind: 'fa', className: 'fas fa-users' }],
      ['fab fa-microsoft', { kind: 'fa', className: 'fab fa-microsoft' }],
      ['far fa-user', { kind: 'fa', className: 'far fa-user' }],
      ['fas fa-house-user', { kind: 'fa', className: 'fas fa-house-user' }]
    ])('%s', (icon, expected) => {
      const out = resolve(icon);
      expect(out.icon).toEqual(expected);
      expect(out.warnings).toEqual([]);
    });
  });

  describe('refused forms fall back to the default, with a warning naming the entry', () => {
    test.each([
      'http://idp.example.com/favicon.ico',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'images/family.png',
      '//evil.example.com/x.png',
      '/\\evil.example.com/x.png',
      'https://',
      'https://idp.example.com/a b.png',
      'fa-Users',
      'fax fa-users',
      'fas fa-users extra',
      42
    ])('%s', (icon) => {
      const out = resolve(icon);
      expect(out.icon).toEqual(GENERIC);
      expect(out.warnings).toHaveLength(1);
      expect(out.warnings[0]).toContain("'family'");
    });

    test('a refused icon on a preset entry falls back to the preset\'s icon', () => {
      expect(resolve('http://x.example.com/i.png', 'microsoft').icon).toEqual({ kind: 'fa', className: 'fab fa-microsoft' });
    });
  });

  describe('defaults when unset', () => {
    test.each([
      ['google', { kind: 'builtin', id: 'google' }],
      ['microsoft', { kind: 'fa', className: 'fab fa-microsoft' }],
      ['apple', { kind: 'fa', className: 'fab fa-apple' }],
      [undefined, GENERIC]
    ])('preset %s', (preset, expected) => {
      for (const unset of [undefined, null, '']) {
        const out = resolve(unset, preset);
        expect(out.icon).toEqual(expected);
        expect(out.warnings).toEqual([]);
      }
    });

    test('a set icon wins over the preset\'s', () => {
      expect(resolve('fa-users', 'google').icon).toEqual({ kind: 'fa', className: 'fas fa-users' });
    });
  });
});
