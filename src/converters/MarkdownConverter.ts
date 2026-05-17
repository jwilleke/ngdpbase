/**
 * Markdown Pass-Through Converter
 *
 * Imports `.md` and `.markdown` files into ngdpbase without format conversion.
 * Parses existing YAML frontmatter and exposes it as metadata so ImportManager
 * can preserve recognised fields (title, slug, uuid, audience, system-category,
 * user-keywords, author, source-url, etc.) and generate fresh values for any
 * that are missing (uuid, lastModified).
 *
 * @module MarkdownConverter
 */

import matter from 'gray-matter';
import { IContentConverter, ConversionResult } from './IContentConverter.js';
import { classifyWarnings } from './conversionWarning.js';

/**
 * Frontmatter fields that are surfaced as first-class metadata.
 * Any other frontmatter keys are passed through as-is.
 */
const KNOWN_FIELDS = new Set([
  'title',
  'uuid',
  'slug',
  'author',
  'audience',
  'system-category',
  'user-keywords',
  'lastModified',
  'source-url',
  'sourceUrl',
  'tags',
  'description'
]);

class MarkdownConverter implements IContentConverter {
  readonly formatId = 'markdown';
  readonly formatName = 'Markdown';
  readonly fileExtensions = ['.md', '.markdown'];

  /**
   * Parse frontmatter and return body content unchanged.
   *
   * Existing frontmatter fields are extracted as metadata so ImportManager's
   * `buildFrontmatter` can honour them (e.g. preserve a uuid that already
   * exists, carry over audience restrictions, etc.).
   */
  convert(content: string): ConversionResult {
    const warnings: string[] = [];
    const metadata: Record<string, unknown> = {};

    // gray-matter handles both --- and +++ delimiters
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(content);
    } catch (err) {
      warnings.push(`Could not parse frontmatter: ${(err as Error).message} — treating as plain Markdown`);
      return { content, metadata, warnings: classifyWarnings(warnings) };
    }

    // Lift all frontmatter fields into metadata
    for (const [key, value] of Object.entries(parsed.data)) {
      metadata[key] = value;
      if (!KNOWN_FIELDS.has(key)) {
        warnings.push(`Unknown frontmatter field preserved: ${key}`);
      }
    }

    // Flag files that had no frontmatter at all — ImportManager will generate it
    if (Object.keys(parsed.data).length === 0) {
      warnings.push('No frontmatter found — title, uuid, and slug will be generated from filename');
    }

    metadata['importedFrom'] = 'markdown';

    return {
      content: parsed.content.trimStart(),
      metadata,
      warnings: classifyWarnings(warnings)
    };
  }

  /**
   * Accepts .md / .markdown by extension; also matches content that starts
   * with a YAML frontmatter block or a Markdown heading.
   */
  canHandle(content: string, filename: string): boolean {
    const lower = filename.toLowerCase();
    if (this.fileExtensions.some(ext => lower.endsWith(ext))) {
      return true;
    }
    // Content-based: YAML frontmatter or leading ATX heading
    return /^---\r?\n/.test(content) || /^#\s/.test(content);
  }
}

export default MarkdownConverter;

