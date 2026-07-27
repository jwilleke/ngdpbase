/**
 * Fixed version of showdown-footnotes with global flag and hyphen support
 *
 * Original: https://github.com/Kriegslustig/showdown-footnotes
 * Issues Fixed:
 * 1. Missing 'g' flag in footnote reference regex causes only first reference to be replaced
 * 2. Pattern [\d\w]+ doesn't match hyphens, preventing identifiers like [^my-note]
 *
 * Fixes:
 * 1. Changed /m to /mg in the third filter function
 * 2. Changed [\d\w]+ to [\d\w-]+ to support hyphens in identifiers
 */

import showdown from 'showdown';
import { guardShowdownInput } from '../utils/showdownGuard.js';

/**
 * Showdown extension filter object
 */
interface ShowdownFilter {
  type: 'lang' | 'output';
  filter: (text: string) => string;
}

const converter = new showdown.Converter();

/**
 * Showdown footnotes extension factory
 * @returns Array of showdown filter objects
 */
function showdownFootnotesFixed(): ShowdownFilter[] {
  return [{
    // Multi-paragraph footnotes with indentation
    type: 'lang',
    filter: function filter(text: string): string {
      return text.replace(
        /^\[\^([\d\w-]+)\]:\s*((\n+(\s{2,4}|\t).+)+)$/mg,
        function (_str: string, name: string, rawContent: string, _: string, padding: string): string {
          // Guarded independently (#1000). This is a SEPARATE Converter from the
          // one RenderingManager owns, so it does not inherit the caller's
          // guard — and re-guarding already-escaped text is a no-op, since the
          // escape leaves no `](` for the guard to find.
          const content = converter.makeHtml(guardShowdownInput(rawContent.replace(new RegExp('^' + padding, 'gm'), '')));
          return '<div class="footnote" id="footnote-' + name + '"><a href="#footnote-' + name + '"><sup>[' + name + ']</sup></a>:' + content + '</div>';
        }
      );
    }
  }, {
    // Single-line footnote definitions
    // FIXED: Match only up to end of line (not across lines) to prevent
    // consecutive [^N]: definitions from being swallowed into one element
    type: 'lang',
    filter: function filter(text: string): string {
      return text.replace(
        /^\[\^([\d\w-]+)\]: (.+)$/mg,
        function (_str: string, name: string, content: string): string {
          // Auto-link bare URLs in footnote content
          const linked = content.replace(
            /(https?:\/\/[^\s<]+)/g,
            '<a href="$1" target="_blank" rel="noopener">$1</a>'
          );
          return '<small class="footnote" id="footnote-' + name + '"><a href="#footnote-' + name + '"><sup>[' + name + ']</sup></a>: ' + linked + '</small>';
        }
      );
    }
  }, {
    // Footnote references in text
    // FIXED: Added 'g' flag to replace ALL occurrences, not just the first one
    // FIXED: Added hyphen support to match identifiers like [^my-note]
    type: 'lang',
    filter: function filter(text: string): string {
      return text.replace(
        /\[\^([\d\w-]+)\]/mg,
        function (_str: string, name: string): string {
          return '<a href="#footnote-' + name + '"><sup>[' + name + ']</sup></a>';
        }
      );
    }
  }];
}

export default showdownFootnotesFixed;

