/**
 * The InterWiki sites this instance ships (#1101).
 *
 * These assert the SHIPPED config renders real links, not that a hand-built
 * fixture does. An InterWiki prefix is a user-facing contract — `[X|geo:Y]`
 * appears in page source — and a typo in `app-default-config.json` produces a
 * silently wrong href rather than an error, so the config is exercised through
 * the real parser rather than merely inspected.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { LinkParser } from '../LinkParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Site { url: string; description?: string; enabled?: boolean; openInNewWindow?: boolean }

const config = fs.readJsonSync(path.join(__dirname, '../../../config/app-default-config.json'));
const sites = config['ngdpbase.interwiki.sites'] as Record<string, Site>;

/** Render one wiki link and return its href. */
function hrefOf(parser: LinkParser, markup: string): string {
  const html = parser.parseLinks(markup, {});
  return html.match(/href="([^"]*)"/)?.[1] ?? '';
}

describe('shipped InterWiki sites', () => {
  let parser: LinkParser;

  beforeEach(() => {
    parser = new LinkParser();
    parser.setInterWikiSites(sites);
  });

  describe('config integrity', () => {
    it('every site has a url with a %s placeholder', () => {
      const bad = Object.entries(sites).filter(([, s]) => !s.url?.includes('%s'));
      expect(bad.map(([k]) => k)).toEqual([]);
    });

    it('every site declares enabled as a boolean', () => {
      const bad = Object.entries(sites).filter(([, s]) => typeof s.enabled !== 'boolean');
      expect(bad.map(([k]) => k)).toEqual([]);
    });
  });

  describe('geo: — GeoHazardWatch (#1101)', () => {
    it('is shipped and points at the /view/ page route', () => {
      // /view/ is the canonical page URL for an ngdpbase instance, which is
      // what geohazardwatch.com runs. Verified against the live site.
      expect(sites.geo?.url).toBe('https://geohazardwatch.com/view/%s');
    });

    it('renders a link to the named page', () => {
      expect(hrefOf(parser, '[Volcanoes|geo:Volcanoes]'))
        .toBe('https://geohazardwatch.com/view/Volcanoes');
    });

    it('encodes a page name containing spaces', () => {
      expect(hrefOf(parser, '[About|geo:About geohazardwatch]'))
        .toBe('https://geohazardwatch.com/view/About%20geohazardwatch');
    });
  });

  describe('grok: — Grokipedia (#1101)', () => {
    it('is shipped and points at the /page/ article route', () => {
      // /page/ verified against the live site: a real article returns 200,
      // a non-existent one 404, and /wiki/ 404 — so this is the real route,
      // not an SPA catch-all.
      expect(sites.grok?.url).toBe('https://grokipedia.com/page/%s');
    });

    it('renders a link to the named article', () => {
      expect(hrefOf(parser, '[Elon Musk|grok:Elon_Musk]'))
        .toBe('https://grokipedia.com/page/Elon_Musk');
    });
  });

  describe('prefix resolution', () => {
    it('is case-insensitive for a lowercase-keyed site', () => {
      // The lookup tries the literal prefix, then lowercase — so a lowercase
      // key accepts every casing a page author might type.
      expect(hrefOf(parser, '[x|GEO:Volcanoes]')).toBe('https://geohazardwatch.com/view/Volcanoes');
      expect(hrefOf(parser, '[x|Geo:Volcanoes]')).toBe('https://geohazardwatch.com/view/Volcanoes');
    });

    it('keeps geo: and grok: distinct', () => {
      // They were nearly `geo:` and `ge:`, one character apart. This pins the
      // separation so a future rename cannot quietly collapse them.
      expect(hrefOf(parser, '[x|geo:Same]')).toContain('geohazardwatch.com');
      expect(hrefOf(parser, '[x|grok:Same]')).toContain('grokipedia.com');
    });

    it('opens in a new tab with a safe rel, like the other sites', () => {
      const html = parser.parseLinks('[x|geo:Volcanoes]', {});
      expect(html).toContain('target="_blank"');
      expect(html).toContain('noopener');
    });

    it('does not treat an unknown prefix as a working InterWiki link', () => {
      // Guards against a prefix typo silently resolving somewhere.
      expect(() => parser.parseLinks('[x|nosuchsite:Page]', {})).not.toThrow();
      expect(hrefOf(parser, '[x|nosuchsite:Page]')).not.toContain('grokipedia');
    });
  });
});
