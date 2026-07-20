/**
 * JSPWiki to Markdown Converter
 *
 * Converts JSPWiki syntax to Markdown format for import into ngdpbase.
 * Implements IContentConverter interface for use with ImportManager.
 *
 * Reference: https://github.com/apache/jspwiki/blob/main/jspwiki-wikipages/en/src/main/resources/TextFormattingRules.txt
 *
 * @module JSPWikiConverter
 */

import { IContentConverter, ConversionResult } from './IContentConverter.js';
import { classifyWarnings } from './conversionWarning.js';

/**
 * JSPWiki syntax to Markdown converter
 */
class JSPWikiConverter implements IContentConverter {
  readonly formatId = 'jspwiki';
  readonly formatName = 'JSPWiki';
  readonly fileExtensions = ['.txt'];

  /**
   * Convert JSPWiki content to Markdown
   *
   * @param content - JSPWiki formatted content
   * @returns ConversionResult with Markdown content, metadata, and warnings
   */
  convert(content: string): ConversionResult {
    const warnings: string[] = [];
    const metadata: Record<string, unknown> = {};

    // Extract [{SET name=value}] attributes first
    let result = this.extractAttributes(content, metadata, warnings);

    // Extract %%category [Name]%% blocks and convert to user-keywords
    result = this.extractCategories(result, metadata, warnings);

    // Process in order to avoid conflicts:
    // - Code blocks first (protect their content from other conversions)
    // - Lists BEFORE headings (so JSPWiki `#` lists are converted before JSPWiki `!` headings become Markdown `#`)
    // - Emphasis must avoid list markers
    result = this.convertCodeBlocks(result, warnings);
    result = this.convertLists(result);           // Convert JSPWiki # lists before headings create Markdown # headers
    result = this.convertHeadings(result);        // Now safe to convert ! headings to # headers
    result = this.convertEmphasis(result);
    result = this.convertMonospace(result);
    result = this.convertDefinitionLists(result);
    result = this.convertHorizontalRules(result);
    result = this.convertLineBreaks(result);
    result = this.convertLinks(result, warnings);
    result = this.convertFootnotes(result, warnings);
    result = this.convertInlineStyles(result);
    result = this.convertImagePaths(result);

    // Tables are NOT converted during import — JSPWikiPreprocessor handles
    // ||/| table syntax at render time, preserving wiki links inside cells

    metadata['importedFrom'] = 'jspwiki';

    return {
      content: result.trim(),
      metadata,
      warnings: classifyWarnings(warnings)
    };
  }

  /**
   * Check if this converter can handle the given content
   * Uses filename extension and content pattern detection
   */
  canHandle(content: string, filename: string): boolean {
    // Check file extension
    if (this.fileExtensions.some(ext => filename.toLowerCase().endsWith(ext))) {
      return true;
    }

    // YAML frontmatter means markdown/NCM, never JSPWiki (#879) — NCM shares
    // ||table|| and %%style forms with JSPWiki, so without this guard the
    // patterns below claim NCM content and the conversion mangles it.
    if (/^---\r?\n/.test(content)) {
      return false;
    }

    // Content-based detection: check for JSPWiki-specific patterns
    const jspwikiPatterns = [
      /^\s*!{1,3}\s+\S/m,         // JSPWiki headings (!, !!, !!!)
      /\[\{SET\s+/,               // JSPWiki SET directive
      /\[\{INSERT\s+/,            // JSPWiki INSERT plugin
      /__[^_]+__/,                // JSPWiki bold (not markdown)
      /''[^']+''(?!')/,           // JSPWiki italic
      /^\s*\|\|[^|]+\|\|/m,       // JSPWiki table headers
      /%%[a-zA-Z0-9_-]+\s*$/m     // JSPWiki style blocks
    ];

    return jspwikiPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Extract [{SET name=value}] attributes and convert to metadata
   */
  private extractAttributes(
    content: string,
    metadata: Record<string, unknown>,
    warnings: string[]
  ): string {
    // Pattern: [{SET name='value'}] or [{SET name=value}]
    const setPattern = /\[\{SET\s+([a-zA-Z0-9_-]+)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s}]+))\s*}]/gi;

    const result = content.replace(setPattern, (_match: string, name: string, singleQuoted: string | undefined, doubleQuoted: string | undefined, unquoted: string | undefined) => {
      const value: string = singleQuoted ?? doubleQuoted ?? unquoted ?? '';

      // Map common JSPWiki attributes to ngdpbase metadata
      const normalizedName = name.toLowerCase();
      if (normalizedName === 'title' || normalizedName === 'pagetitle') {
        metadata['title'] = value;
      } else if (normalizedName === 'author') {
        metadata['author'] = value;
      } else if (normalizedName === 'alias') {
        // JSPWiki page aliases
        if (!metadata['aliases']) {
          metadata['aliases'] = [];
        }
        (metadata['aliases'] as string[]).push(value);
      } else {
        // Store other attributes in a jspwiki namespace
        if (!metadata['jspwiki']) {
          metadata['jspwiki'] = {};
        }
        (metadata['jspwiki'] as Record<string, string>)[name] = value;
      }

      return ''; // Remove the SET directive from content
    });

    // Detect unhandled plugin directives, excluding known-safe ones
    // Known safe: Image, ATTACH, SET (already extracted), $ (variables), TableOfContents
    const pluginPattern = /\[\{(?!Image\s|ATTACH\s|SET\s|\$|TableOfContents[\s}])([A-Za-z]\w*)\s[^}]*}]/gi;
    const plugins = content.match(pluginPattern);
    if (plugins && plugins.length > 0) {
      const pluginNames = [...new Set(
        plugins.map(p => p.match(/\[\{(\w+)/)?.[1]).filter(Boolean)
      )];
      warnings.push(`Found ${plugins.length} unhandled JSPWiki plugin(s): ${pluginNames.join(', ')}`);
    }

    return result;
  }

  /**
   * Extract %%category [Name]%% blocks and convert to user-keywords
   *
   * JSPWiki uses category blocks for page categorization:
   *   %%category [CategoryName]%%      - single line, %% closing
   *   %%category [CategoryName] /%     - may span lines, /% closing
   *
   * These are converted to ngdpbase's user-keywords metadata array.
   */
  private extractCategories(
    content: string,
    metadata: Record<string, unknown>,
    warnings: string[]
  ): string {
    const categories: string[] = [];

    // Match %%category [Name]%% or %%category [Name] /%
    const categoryPattern = /%%category\s+\[([^\]]+)\]\s*(?:%%|\/%)/gi;

    const result = content.replace(
      categoryPattern,
      (_match: string, categoryName: string) => {
        const trimmedName = categoryName.trim();
        if (trimmedName) {
          const normalizedName = trimmedName.toLowerCase();
          if (!categories.includes(normalizedName)) {
            categories.push(normalizedName);
          }
        }
        return ''; // Remove the category block from content
      }
    );

    if (categories.length > 0) {
      const existingKeywords = (metadata['user-keywords'] as string[]) || [];
      const mergedKeywords = [...new Set([...existingKeywords, ...categories])];
      metadata['user-keywords'] = mergedKeywords;

      if (mergedKeywords.length > 5) {
        warnings.push(
          `Extracted ${categories.length} categories, total ${mergedKeywords.length} user-keywords exceeds limit of 5`
        );
      }
    }

    return result;
  }

  /**
   * Convert JSPWiki headings to Markdown
   * !!! -> # (h1), !! -> ## (h2), ! -> ### (h3)
   */
  private convertHeadings(content: string): string {
    // Process in order from most exclamation marks to least
    // to avoid partial matches

    // !!! heading -> # heading (h1 - large)
    let result = content.replace(/^!!![ \t]*(.+)$/gm, '# $1');

    // !! heading -> ## heading (h2 - medium)
    result = result.replace(/^!![ \t]*(.+)$/gm, '## $1');

    // ! heading -> ### heading (h3 - small)
    result = result.replace(/^![ \t]*(.+)$/gm, '### $1');

    return result;
  }

  /**
   * Convert JSPWiki emphasis to Markdown
   * __bold__ -> **bold**
   * ''italic'' -> *italic*
   */
  private convertEmphasis(content: string): string {
    // Bold: __text__ -> **text**
    // Use non-greedy match and avoid matching across lines
    let result = content.replace(/__([^_\n]+)__/g, '**$1**');

    // Italic: ''text'' -> *text*
    // Avoid matching empty or multi-line content
    result = result.replace(/''([^'\n]+)''/g, '*$1*');

    return result;
  }

  /**
   * Convert JSPWiki monospace to Markdown inline code
   * {{text}} -> `text`
   */
  private convertMonospace(content: string): string {
    // Inline monospace: {{text}} -> `text`
    // Don't match {{{ which is code block
    return content.replace(/\{\{([^{}\n]+)\}\}/g, '`$1`');
  }

  /**
   * Convert JSPWiki code blocks to Markdown
   * {{{ code }}} -> ``` code ```
   */
  private convertCodeBlocks(content: string, warnings: string[]): string {
    // Multi-line code blocks
    // JSPWiki: {{{
    //   code here
    // }}}
    // Markdown: ```
    //   code here
    // ```

    // Pattern matches opening {{{ on its own line, content, and closing }}} on its own line
    let result = content.replace(
      /^\{\{\{\s*$/gm,
      '```'
    );

    result = result.replace(
      /^\}\}\}\s*$/gm,
      '```'
    );

    // Inline code blocks: {{{ code }}} on same line
    // This is less common but valid
    result = result.replace(/\{\{\{([^}]+)\}\}\}/g, (match: string, code: string) => {
      // If code contains newlines, it's a block - already handled
      if (code.includes('\n')) {
        return match;
      }
      // Single line code
      return '`' + code.trim() + '`';
    });

    // Check for unclosed code blocks
    const openings = (result.match(/```/g) || []).length;
    if (openings % 2 !== 0) {
      warnings.push('Unbalanced code blocks detected - manual review may be needed');
    }

    return result;
  }

  /**
   * Convert JSPWiki lists to Markdown
   * * item -> - item (unordered)
   * ** nested -> - - nested (indented unordered)
   * # item -> 1. item (ordered)
   * ## nested -> 1. 1. nested (indented ordered)
   */
  private convertLists(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];

    for (const line of lines) {
      // Check for unordered list: * or ** or ***
      const unorderedMatch = line.match(/^(\*+)\s*(.*)$/);
      if (unorderedMatch) {
        const depth = unorderedMatch[1].length;
        const text = unorderedMatch[2];
        const indent = '  '.repeat(depth - 1);
        result.push(`${indent}- ${text}`);
        continue;
      }

      // Check for ordered list: # or ## or ###
      const orderedMatch = line.match(/^(#+)\s*(.*)$/);
      if (orderedMatch) {
        const depth = orderedMatch[1].length;
        const text = orderedMatch[2];
        const indent = '  '.repeat(depth - 1);
        result.push(`${indent}1. ${text}`);
        continue;
      }

      result.push(line);
    }

    return result.join('\n');
  }

  /**
   * Convert JSPWiki definition lists to Markdown
   * ;term:definition -> **term**: definition
   */
  private convertDefinitionLists(content: string): string {
    // ;term:definition -> **term**: definition
    return content.replace(/^;([^:\n]+):(.*)$/gm, '**$1**: $2');
  }

  /**
   * Convert JSPWiki horizontal rules to Markdown
   * ---- (or more dashes) -> ---
   */
  private convertHorizontalRules(content: string): string {
    // Replace ---- (or more) with --- and ensure a blank line precedes it,
    // so Markdown doesn't interpret --- as a setext heading underline
    const lines = content.split('\n');
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (/^-{4,}\s*$/.test(lines[i])) {
        // If previous line has content, insert a blank line first
        if (i > 0 && result.length > 0 && result[result.length - 1].trim().length > 0) {
          result.push('');
        }
        result.push('---');
      } else {
        result.push(lines[i]);
      }
    }

    return result.join('\n');
  }

  /**
   * Convert JSPWiki line breaks to Markdown
   * \\ -> backslash + newline (CommonMark hard line break)
   */
  private convertLineBreaks(content: string): string {
    // Handle \\ at end of line (before newline) - replace with backslash
    let result = content.replace(/\\\\(\r?\n)/g, '\\\n');
    // Handle \\ mid-line - replace with backslash + newline
    result = result.replace(/\\\\/g, '\\\n');
    return result;
  }

  /**
   * Convert JSPWiki links to Markdown/WikiLink format
   * [link] -> [[link]]
   * [display text|link] -> [[link|display text]]
   */
  private convertLinks(content: string, warnings: string[]): string {
    let result = content;

    // External links with display text: [text|http://url]
    // Convert to Markdown: [text](url)
    result = result.replace(
      /\[([^|\]]+)\|(https?:\/\/[^\]]+)\]/g,
      '[$1]($2)'
    );

    // Bare external links: [http://url] -> plain URL
    result = result.replace(
      /\[(https?:\/\/[^\]]+)\]/g,
      '$1'
    );

    // ngdpbase natively supports JSPWiki wiki link syntax:
    //   [PageName], [DisplayText|PageName], [{$variable}], [{Plugin ...}]
    // These are left as-is — no conversion needed.

    // Detect CamelCase link disable syntax: ~NoLink
    const camelCaseDisable = result.match(/~([A-Z][a-z]+(?:[A-Z][a-z]+)+)/g);
    if (camelCaseDisable && camelCaseDisable.length > 0) {
      // Remove the ~ prefix
      result = result.replace(/~([A-Z][a-z]+(?:[A-Z][a-z]+)+)/g, '$1');
      warnings.push('CamelCase link prevention (~Word) converted - verify no unintended links');
    }

    return result;
  }

  /**
   * Convert JSPWiki footnotes to Markdown footnotes
   * [1] -> [^1]
   * [#1] footnote text -> [^1]: footnote text
   */
  private convertFootnotes(content: string, warnings: string[]): string {
    let result = content;

    // Footnote references: [1], [2], etc. -> [^1], [^2]
    result = result.replace(/\[(\d+)\]/g, '[^$1]');

    // Footnote definitions: [#1] text -> [^1]: text
    result = result.replace(/^\[#(\d+)\]\s*(.*)$/gm, '[^$1]: $2');

    // Check if there are unmatched footnotes
    const refs = new Set((result.match(/\[\^(\d+)\]/g) || []).map(m => m.slice(2, -1)));
    const defs = new Set((result.match(/\[\^(\d+)\]:/g) || []).map(m => m.slice(2, -2)));

    const missingDefs = [...refs].filter(r => !defs.has(r));
    if (missingDefs.length > 0) {
      warnings.push(`Footnote references without definitions: ${missingDefs.join(', ')}`);
    }

    return result;
  }

  /**
   * Convert JSPWiki inline style patterns to Markdown/HTML
   *
   * Supports both closing syntaxes: /% and %%
   *   %%sup text /% -> <sup>text</sup>
   *   %%sup text%% -> <sup>text</sup>
   *   %%sub text /% -> <sub>text</sub>
   *   %%strike text /% -> ~~text~~
   *
   * Status boxes (block-level, converted to Bootstrap alerts):
   *   %%information ... /%  -> <div class="alert alert-info">...</div>
   *   %%warning ... /%      -> <div class="alert alert-warning">...</div>
   *   %%error ... /%        -> <div class="alert alert-danger">...</div>
   */
  private convertInlineStyles(content: string): string {
    // Common closing pattern: either /% or %%
    // Using (?:%%|\/%) to match either closing syntax

    // %%sup text (/% or %%) -> <sup>text</sup>
    let result = content.replace(/%%sup\s+([\s\S]*?)\s*(?:\/%|%%)/gi, '<sup>$1</sup>');

    // %%sub text (/% or %%) -> <sub>text</sub>
    result = result.replace(/%%sub\s+([\s\S]*?)\s*(?:\/%|%%)/gi, '<sub>$1</sub>');

    // %%strike text (/% or %%) -> ~~text~~
    result = result.replace(/%%strike\s+([\s\S]*?)\s*(?:\/%|%%)/gi, '~~$1~~');

    // Status boxes - convert to Bootstrap alert divs
    // These are typically block-level but can be inline too

    // %%information ... (/% or %%) -> alert-info
    result = result.replace(
      /%%information\s+([\s\S]*?)\s*(?:\/%|%%)/gi,
      '<div class="alert alert-info" role="alert">$1</div>'
    );

    // %%warning ... (/% or %%) -> alert-warning
    result = result.replace(
      /%%warning\s+([\s\S]*?)\s*(?:\/%|%%)/gi,
      '<div class="alert alert-warning" role="alert">$1</div>'
    );

    // %%error ... (/% or %%) -> alert-danger
    result = result.replace(
      /%%error\s+([\s\S]*?)\s*(?:\/%|%%)/gi,
      '<div class="alert alert-danger" role="alert">$1</div>'
    );

    return result;
  }

  /**
   * Strip page paths from Image plugin src attributes
   *
   * JSPWiki uses page-level attachments, so image paths include the page name:
   *   [{Image src='Geological Timeline/Geolog_path_text.svg.png' ...}]
   *
   * ngdpbase uses a flat attachment structure, so we strip the path:
   *   [{Image src='Geolog_path_text.svg.png' ...}]
   */
  private convertImagePaths(content: string): string {
    // Match [{Image src='path/to/file.ext' ...}] and strip path from src
    // Use regex to find and replace src values directly
    return content.replace(
      /\[\{Image\s+([^}]*)\}\]/gi,
      (fullMatch: string, attributes: string) => {
        // Replace src='path/file' or src="path/file" with just the filename
        const updatedAttributes = attributes.replace(
          /src\s*=\s*(['"])([^'"]+)\1/gi,
          (srcMatch: string, quote: string, srcValue: string) => {
            // Extract just the filename (after the last slash)
            if (!srcValue.includes('/')) {
              return srcMatch; // No path to strip, return original
            }
            const filename = srcValue.substring(srcValue.lastIndexOf('/') + 1);
            return `src=${quote}${filename}${quote}`;
          }
        );
        // Only return modified if attributes changed
        if (updatedAttributes !== attributes) {
          return `[{Image ${updatedAttributes}}]`;
        }
        return fullMatch;
      }
    );
  }

  // Table conversion removed — JSPWikiPreprocessor handles ||/| table syntax
  // at render time, preserving wiki links and other JSPWiki syntax inside cells
}

export default JSPWikiConverter;

