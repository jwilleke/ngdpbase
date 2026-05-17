/**
 * HTML to Markdown Converter
 *
 * Converts HTML web pages to Markdown for import into ngdpbase.
 * Uses linkedom for DOM parsing/content extraction and turndown for HTML-to-Markdown conversion.
 * Extracts metadata from HTML head, meta tags, Open Graph, and Schema.org markup.
 *
 * @module HtmlConverter
 */

import { IContentConverter, ConversionResult } from './IContentConverter.js';
import { classifyWarnings } from './conversionWarning.js';
import TurndownService from 'turndown';

import { parseHTML } from 'linkedom';
import type { LinkedomDocument, LinkedomElement } from 'linkedom';

/** Elements to remove before content extraction */
const REMOVE_ELEMENTS = [
  'script',
  'style',
  'nav',
  'header',
  'footer',
  'aside',
  'iframe',
  'noscript',
  'svg'
];

/** Selectors tried in order to find primary content */
const CONTENT_SELECTORS = ['article', 'main', '[role="main"]', '.content', '.post', '.entry'];

/**
 * Schema.org metadata extracted from HTML
 */
interface SchemaMetadata {
  url?: string;
  name?: string;
  description?: string;
  author?: string;
  datePublished?: string;
  dateModified?: string;
  publisher?: string;
  keywords?: string[];
  image?: string;
  inLanguage?: string;
}

/**
 * HTML to Markdown converter
 *
 * Implements IContentConverter for importing web pages as wiki pages.
 * Extracts the primary article content, strips boilerplate, and converts to Markdown.
 */
class HtmlConverter implements IContentConverter {
  readonly formatId = 'html';
  readonly formatName = 'HTML Web Page';
  readonly fileExtensions = ['.html', '.htm'];

  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*'
    });

    // Keep code blocks with language hints
    this.turndown.addRule('fencedCodeBlock', {
      filter: (node: LinkedomElement): boolean => {
        return (
          node.nodeName === 'PRE' &&
          node.firstChild !== null &&
          node.firstChild.nodeName === 'CODE'
        );
      },
      replacement: (_content: string, node: LinkedomElement): string => {
        const codeNode = node.firstChild as LinkedomElement;
        const className = codeNode.getAttribute('class') || '';
        const langMatch = className.match(/language-(\S+)/);
        const lang = langMatch ? langMatch[1] : '';
        const code = codeNode.textContent || '';
        return `\n\n\`\`\`${lang}\n${code.replace(/\n$/, '')}\n\`\`\`\n\n`;
      }
    });
  }

  /**
   * Convert HTML content to Markdown
   *
   * @param content - Raw HTML string
   * @returns ConversionResult with Markdown content, metadata, and warnings
   */
  convert(content: string): ConversionResult {
    const warnings: string[] = [];
    const metadata: Record<string, unknown> = {};

    const { document } = parseHTML(content);

    // Extract metadata from <head>
    const schema = this.extractMetadata(document, metadata);
    if (Object.keys(schema).length > 0) {
      metadata['schema'] = schema;
    }

    // Remove unwanted elements
    this.removeElements(document, warnings);

    // Find primary content
    const contentHtml = this.extractContent(document, warnings);

    // Convert to Markdown
    let markdown = this.turndown.turndown(contentHtml);

    // Convert escaped citation references \[1\] to Markdown footnotes [^1]
    // to prevent the JSPWiki parser from interpreting them as wiki links
    markdown = markdown.replace(/\\\[(\d+)\\\]/g, '[^$1]');

    // Convert numbered reference lists to footnote definitions
    markdown = this.convertReferencesToFootnotes(markdown);

    // Clean up excessive whitespace
    const cleaned = markdown.replace(/\n{3,}/g, '\n\n').trim();

    if (!cleaned) {
      warnings.push('No meaningful content extracted from HTML');
    }

    return {
      content: cleaned,
      metadata,
      warnings: classifyWarnings(warnings)
    };
  }

  /**
   * Check if this converter can handle the given content
   */
  canHandle(content: string, filename: string): boolean {
    // Extension check
    if (this.fileExtensions.some(ext => filename.toLowerCase().endsWith(ext))) {
      return true;
    }

    // Content-based: check for HTML markers
    const trimmed = content.trim().toLowerCase();
    return (
      trimmed.startsWith('<!doctype html') ||
      trimmed.startsWith('<html') ||
      (trimmed.includes('<head') && trimmed.includes('<body'))
    );
  }

  /**
   * Extract metadata from HTML head and Schema.org markup
   */
   
  private extractMetadata(document: LinkedomDocument, metadata: Record<string, unknown>): SchemaMetadata {
    const schema: SchemaMetadata = {};

    // Title: <title> or og:title
    const titleEl = document.querySelector('title');
    const titleText = titleEl?.textContent?.trim();
    const ogTitle = this.getMetaContent(document, 'og:title');
    metadata['title'] = ogTitle || titleText || '';
    if (metadata['title']) {
      schema.name = metadata['title'] as string;
    }

    // Canonical URL
     
    const canonical = document.querySelector('link[rel="canonical"]');
     
    const canonicalUrl = canonical?.getAttribute('href') as string | undefined;
    const ogUrl = this.getMetaContent(document, 'og:url');
    if (canonicalUrl || ogUrl) {
      schema.url = canonicalUrl || ogUrl || undefined;
    }

    // Description
    const description =
      this.getMetaContent(document, 'description') ||
      this.getMetaContent(document, 'og:description');
    if (description) {
      schema.description = description;
    }

    // Author
    const author =
      this.getMetaContent(document, 'author') ||
      this.getMetaContent(document, 'article:author');
    if (author) {
      schema.author = author;
    }

    // Dates
    const published = this.getMetaContent(document, 'article:published_time');
    if (published) {
      schema.datePublished = published;
    }
    const modified = this.getMetaContent(document, 'article:modified_time');
    if (modified) {
      schema.dateModified = modified;
    }

    // Publisher / site name
    const publisher = this.getMetaContent(document, 'og:site_name');
    if (publisher) {
      schema.publisher = publisher;
    }

    // Keywords
    const keywords = this.getMetaContent(document, 'keywords');
    if (keywords) {
      schema.keywords = keywords
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);
    }

    // Image
    const ogImage = this.getMetaContent(document, 'og:image');
    if (ogImage) {
      schema.image = ogImage;
    }

    // Language
     
    const htmlEl = document.querySelector('html');
     
    const lang = htmlEl?.getAttribute('lang') as string | undefined;
    if (lang) {
      schema.inLanguage = lang;
    }

    // Try Schema.org JSON-LD
    this.extractJsonLd(document, schema);

    return schema;
  }

  /**
   * Get content of a meta tag by name or property
   */
   
  private getMetaContent(document: LinkedomDocument, nameOrProperty: string): string | undefined {
     
    const el = document.querySelector(`meta[name="${nameOrProperty}"]`) ||
      document.querySelector(`meta[property="${nameOrProperty}"]`);  
     
    const val = el?.getAttribute('content') as string | undefined;
    return val?.trim() || undefined;
  }

  /**
   * Extract Schema.org JSON-LD data if present
   */
   
  private extractJsonLd(document: LinkedomDocument, schema: SchemaMetadata): void {
     
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
     
    if (!scripts || scripts.length === 0) return;

     
    scripts.forEach((script: LinkedomElement) => {
      try {
        const data = JSON.parse(script.textContent ?? '') as Record<string, unknown>;
        const type = (data['@type'] as string) || '';

        // Only process Article/WebPage types
        if (!type.match(/Article|WebPage|NewsArticle|BlogPosting/i)) return;

        if (!schema.author && data['author']) {
          const authorData = data['author'] as Record<string, unknown>;
          schema.author = (authorData['name'] as string) || (data['author'] as string);
        }
        if (!schema.datePublished && data['datePublished']) {
          schema.datePublished = data['datePublished'] as string;
        }
        if (!schema.dateModified && data['dateModified']) {
          schema.dateModified = data['dateModified'] as string;
        }
        if (!schema.publisher && data['publisher']) {
          const pub = data['publisher'] as Record<string, unknown>;
          schema.publisher = (pub['name'] as string) || (data['publisher'] as string);
        }
        if (!schema.description && data['description']) {
          schema.description = data['description'] as string;
        }
        if (!schema.image && data['image']) {
          const img = data['image'];
          if (typeof img === 'string') {
            schema.image = img;
          } else if (typeof img === 'object' && img !== null) {
            schema.image = (img as Record<string, unknown>)['url'] as string;
          }
        }
        if (!schema.inLanguage && data['inLanguage']) {
          schema.inLanguage = data['inLanguage'] as string;
        }
      } catch {
        // Invalid JSON-LD — ignore
      }
    });
  }

  /**
   * Remove unwanted elements from the document
   */
   
  private removeElements(document: LinkedomDocument, warnings: string[]): void {
    let removedCount = 0;
    for (const selector of REMOVE_ELEMENTS) {
       
      const elements = document.querySelectorAll(selector);
       
      elements.forEach((el: { remove: () => void }) => {
        el.remove();
        removedCount++;
      });
    }

    if (removedCount > 0) {
      warnings.push(`Removed ${removedCount} boilerplate element(s) (nav, header, footer, etc.)`);
    }
  }

  /**
   * Extract the primary content from the document
   * Tries article, main, [role=main], .content, then falls back to body
   */
   
  private extractContent(document: LinkedomDocument, warnings: string[]): string {
    // Try each content selector in priority order
    for (const selector of CONTENT_SELECTORS) {
       
      const el = document.querySelector(selector);
      if (el) {
         
        const html = el.innerHTML;
        if (html && html.trim().length > 100) {
          return html;
        }
      }
    }

    // Fall back to body
     
    const body = document.querySelector('body');
    if (body) {
      warnings.push('No article/main element found — used full body content');
       
      return body.innerHTML;
    }

    // Last resort: entire document
    warnings.push('No body element found — used entire document');
     
    return document.documentElement?.innerHTML as string || '';
  }

  /**
   * Convert a numbered references section into Markdown footnote definitions.
   *
   * Detects patterns like:
   *   ## References
   *   1.  [url](url)
   *   2.  [url](url)
   *
   * And converts to:
   *   ----
   *   [^1]: url
   *   [^2]: url
   */
  private convertReferencesToFootnotes(markdown: string): string {
    // Match a "References" heading followed by numbered list items
    const refSectionRegex = /^#{1,3}\s*References?\s*$/im;
    const refMatch = refSectionRegex.exec(markdown);
    if (!refMatch) return markdown;

    const beforeRefs = markdown.slice(0, refMatch.index).trimEnd();
    const refSection = markdown.slice(refMatch.index + refMatch[0].length);

    // Parse numbered items: "1.  [text](url)" or "1.  url"
    const footnotes: string[] = [];
    const itemRegex = /^\d+\.\s+(?:\[([^\]]*)\]\(([^)]+)\)|(\S+))/gm;
    let match;
    while ((match = itemRegex.exec(refSection)) !== null) {
      const num = footnotes.length + 1;
      // Prefer the URL from [text](url), otherwise raw URL
      const url = match[2] || match[3] || match[1];
      if (url) {
        footnotes.push(`[^${num}]: ${url}`);
      }
    }

    if (footnotes.length === 0) return markdown;

    // Rebuild: content + horizontal rule + footnote definitions
    return beforeRefs + '\n\n----\n\n' + footnotes.join('\n') + '\n';
  }
}

export default HtmlConverter;

