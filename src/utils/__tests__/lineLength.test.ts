import { describe, it, expect } from 'vitest';
import { asLineLength, resolveLineLength } from '../lineLength';

describe('asLineLength', () => {
  it('accepts only short and full', () => {
    expect(asLineLength('short')).toBe('short');
    expect(asLineLength('full')).toBe('full');
    expect(asLineLength('site')).toBeNull();
    expect(asLineLength('SHORT')).toBeNull();
    expect(asLineLength(undefined)).toBeNull();
    expect(asLineLength(42)).toBeNull();
  });
});

describe('resolveLineLength', () => {
  it('is full when nothing is set', () => {
    expect(resolveLineLength({})).toBe('full');
  });

  it('uses the site setting for a signed-out visitor', () => {
    expect(resolveLineLength({ site: 'short' })).toBe('short');
    expect(resolveLineLength({ site: 'full' })).toBe('full');
  });

  it('lets a theme choose when the site has not set it', () => {
    expect(resolveLineLength({ theme: 'short' })).toBe('short');
  });

  it('lets an explicit site setting win over the theme', () => {
    expect(resolveLineLength({ site: 'full', theme: 'short' })).toBe('full');
  });

  it("a person's choice wins over the site and the theme", () => {
    expect(resolveLineLength({ user: 'full', site: 'short', theme: 'short' })).toBe('full');
    expect(resolveLineLength({ user: 'short', site: 'full' })).toBe('short');
  });

  it('"site" or an unknown saved value falls back to the site setting', () => {
    expect(resolveLineLength({ user: 'site', site: 'short' })).toBe('short');
    expect(resolveLineLength({ user: 'wide', site: 'short' })).toBe('short');
    expect(resolveLineLength({ user: '', site: 'full' })).toBe('full');
  });

  it('ignores an unknown site or theme value', () => {
    expect(resolveLineLength({ site: 'narrow', theme: 'short' })).toBe('short');
    expect(resolveLineLength({ site: 'narrow', theme: 'huge' })).toBe('full');
  });
});
