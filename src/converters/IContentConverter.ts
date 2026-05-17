/**
 * Content Converter Interface
 *
 * Defines the contract that all content converters must implement.
 * This allows importing content from various wiki formats (JSPWiki, MediaWiki, etc.)
 * and converting them to Markdown format for ngdpbase.
 *
 * @module IContentConverter
 *
 * @example
 * class MyWikiConverter implements IContentConverter {
 *   readonly formatId = 'mywiki';
 *   readonly formatName = 'MyWiki';
 *   readonly fileExtensions = ['.mw'];
 *
 *   convert(content: string): ConversionResult {
 *     // Convert content to Markdown
 *     return { content: convertedMarkdown, metadata: {}, warnings: [] };
 *   }
 *
 *   canHandle(content: string, filename: string): boolean {
 *     return filename.endsWith('.mw') || content.includes('{{MyWikiSyntax}}');
 *   }
 * }
 */

/**
 * A structured conversion warning (#728 S3). `kind` is a stable, aggregatable
 * code (the prerequisite for the #738 conversion-metrics work); `detail` is
 * the human-readable specifics. `kind` is `string` (not an enum) because
 * converters and NCM each contribute their own codes — `NcmWarning` is an
 * assignable subset.
 */
export interface ConversionWarning {
  kind: string;
  detail: string;
}

/**
 * Result of a content conversion operation
 */
export interface ConversionResult {
  /** The converted Markdown content */
  content: string;

  /** Extracted metadata (e.g., from JSPWiki [{SET name=value}] attributes) */
  metadata: Record<string, unknown>;

  /** Structured warnings generated during conversion (non-fatal issues). */
  warnings: ConversionWarning[];
}

/**
 * Content converter interface
 * All format converters must implement these methods
 */
export interface IContentConverter {
  /**
   * Unique identifier for this converter format
   * Used for format selection in import options (e.g., 'jspwiki', 'mediawiki')
   */
  readonly formatId: string;

  /**
   * Human-readable name for this format
   * Displayed in UI format selection (e.g., 'JSPWiki', 'MediaWiki')
   */
  readonly formatName: string;

  /**
   * File extensions this converter handles
   * Used for auto-detection (e.g., ['.txt', '.wiki'])
   */
  readonly fileExtensions: string[];

  /**
   * Convert content from source format to Markdown
   *
   * @param content - The source content to convert
   * @returns Conversion result with Markdown content, metadata, and warnings
   */
  convert(content: string): ConversionResult;

  /**
   * Check if this converter can handle the given content
   * Used for format auto-detection when multiple converters exist
   *
   * @param content - The file content to check
   * @param filename - The filename (for extension checking)
   * @returns True if this converter can handle the content
   */
  canHandle(content: string, filename: string): boolean;
}

export default IContentConverter;
