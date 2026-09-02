import BaseSyntaxHandler, { InitializationContext, ParseContext } from './BaseSyntaxHandler.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import sharp from 'sharp';
import logger from '../../utils/logger.js';

/**
 * Attachment match information
 */
interface AttachmentMatch {
  fullMatch: string;
  filename: string;
  displayText: string | null;
  parameters: string | null;
  index: number;
  length: number;
}

/**
 * Attachment metadata
 */
interface AttachmentMetadata {
  filename: string;
  size: number;
  modified: Date;
  created: Date;
  type: string;
  isImage: boolean;
  path: string;
  url: string;
}

/**
 * Attachment configuration
 */
interface AttachmentConfig {
  enhanced: boolean;
  thumbnails: boolean;
  metadata: boolean;
  thumbnailSizes: string[];
  showFileSize: boolean;
  showModified: boolean;
  iconPath: string;
  cacheMetadata: boolean;
  generateThumbnails: boolean;
  securityChecks: boolean;
}

/**
 * Handler configuration
 */
interface HandlerConfig {
  enabled?: boolean;
  priority?: number;
}

/**
 * Link parameters
 */
interface LinkParams {
  target?: string;
  class?: string;
  [key: string]: string | undefined;
}

/**
 * Wiki engine interface
 */
interface WikiEngine {
  getManager(name: string): unknown;
}

/**
 * Configuration manager interface
 */
interface ConfigManager {
  getProperty<T>(key: string, defaultValue: T): T;
}

/**
 * Markup parser interface
 */
interface MarkupParser {
  getHandlerConfig(name: string): HandlerConfig;
  getCachedHandlerResult(handlerId: string, contentHash: string, contextHash: string): Promise<string | null>;
  cacheHandlerResult(handlerId: string, contentHash: string, contextHash: string, result: string): Promise<void>;
}

/**
 * Attachment manager interface
 */
interface AttachmentManager {
  getAttachmentPath(filename: string): Promise<string>;
  attachmentExists(filename: string): Promise<boolean>;
  uploadAttachment(
    buffer: Buffer,
    fileInfo: { originalName: string; mimeType: string; size: number },
    options: { pageName: string; context: unknown }
  ): Promise<{ identifier: string } | null>;
}

/**
 * Policy manager interface
 */
interface PolicyManager {
  checkPermission(userContext: unknown, permission: string, resource: string): Promise<boolean>;
}

/**
 * Extended parse context
 */
interface AttachmentParseContext extends ParseContext {
  getManager(name: string): unknown;
  userContext?: unknown;
  isAuthenticated(): boolean;
}

/**
 * AttachmentHandler - Advanced attachment processing with thumbnails and metadata
 *
 * Supports enhanced JSPWiki attachment syntax:
 * - [{ATTACH filename.pdf}] - Simple attachment link
 * - [{ATTACH filename.pdf|Display Name}] - Custom display text
 * - [{ATTACH filename.pdf|Display Name|target=_blank}] - Link parameters
 * - Automatic thumbnail generation for images
 * - File metadata display (size, date, type)
 * - Security validation and permission checks
 *
 * Related Issue: Advanced Attachment Handler (Phase 3)
 * Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support
 */
class AttachmentHandler extends BaseSyntaxHandler {
  declare handlerId: string;
  private engine: WikiEngine | null;
  private config: HandlerConfig | null;
  private attachmentConfig: AttachmentConfig;

  constructor(engine: WikiEngine | null = null) {
    super(
      /\[\{ATTACH\s+([^|}\]]+)(?:\|([^|}\]]+))?(?:\|([^}\]]+))?\}\]/g, // Pattern: [{ATTACH filename|display|params}]
      75, // Medium-high priority
      {
        description: 'Enhanced JSPWiki-style attachment handler with thumbnails and metadata',
        version: '2.0.0',
        dependencies: ['AttachmentManager', 'ConfigurationManager'],
        timeout: 8000,
        cacheEnabled: true
      }
    );
    this.handlerId = 'AttachmentHandler';
    this.engine = engine;
    this.config = null;
    this.attachmentConfig = {
      enhanced: true,
      thumbnails: true,
      metadata: true,
      thumbnailSizes: ['150x150', '300x300'],
      showFileSize: true,
      showModified: true,
      iconPath: '/icons/filetypes',
      cacheMetadata: true,
      generateThumbnails: true,
      securityChecks: true
    };
  }

  /**
   * Initialize handler with modular configuration loading
   * @param context - Initialization context
   */
  protected async onInitialize(context: InitializationContext): Promise<void> {
    this.engine = context.engine ?? null;

    // Load modular configuration from multiple sources
    this.loadModularConfiguration();

    logger.info('AttachmentHandler initialized with modular configuration:');
    logger.info(`   Enhanced mode: ${this.attachmentConfig.enhanced ? 'enabled' : 'disabled'}`);
    logger.info(`   Thumbnails: ${this.attachmentConfig.thumbnails ? 'enabled' : 'disabled'}`);
    logger.info(`   Metadata: ${this.attachmentConfig.metadata ? 'enabled' : 'disabled'}`);
  }

  /**
   * Load configuration from multiple modular sources
   * - app-default-config.json (base configuration)
   * - app-custom-config.json (user overrides via ConfigurationManager)
   * - Handler-specific settings from MarkupParser
   */
  private loadModularConfiguration(): void {
    const configManager = this.engine?.getManager('ConfigurationManager') as ConfigManager | undefined;
    const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;

    // Get base handler configuration from MarkupParser
    if (markupParser) {
      this.config = markupParser.getHandlerConfig('attachment');

      if (this.config?.priority && this.config.priority !== this.priority) {
        logger.info(`AttachmentHandler priority configured as ${this.config.priority} (using ${this.priority})`);
      }
    }

    // Override with values from app-default-config.json and app-custom-config.json
    if (configManager) {
      try {
        // Load from configuration hierarchy
        this.attachmentConfig.enhanced = configManager.getProperty('ngdpbase.markup.handlers.attachment.enhanced', this.attachmentConfig.enhanced);
        this.attachmentConfig.thumbnails = configManager.getProperty('ngdpbase.markup.handlers.attachment.thumbnails', this.attachmentConfig.thumbnails);
        this.attachmentConfig.metadata = configManager.getProperty('ngdpbase.markup.handlers.attachment.metadata', this.attachmentConfig.metadata);

        // Detailed attachment settings
        const thumbnailSizes = configManager.getProperty('ngdpbase.attachment.enhanced.thumbnail-sizes', this.attachmentConfig.thumbnailSizes.join(','));
        this.attachmentConfig.thumbnailSizes = thumbnailSizes.split(',').map((size: string) => size.trim());

        this.attachmentConfig.showFileSize = configManager.getProperty('ngdpbase.attachment.enhanced.show-file-size', this.attachmentConfig.showFileSize);
        this.attachmentConfig.showModified = configManager.getProperty('ngdpbase.attachment.enhanced.show-modified', this.attachmentConfig.showModified);
        this.attachmentConfig.iconPath = configManager.getProperty('ngdpbase.attachment.enhanced.icon-path', this.attachmentConfig.iconPath);
        this.attachmentConfig.cacheMetadata = configManager.getProperty('ngdpbase.attachment.enhanced.cache-metadata', this.attachmentConfig.cacheMetadata);
        this.attachmentConfig.generateThumbnails = configManager.getProperty('ngdpbase.attachment.enhanced.generate-thumbnails', this.attachmentConfig.generateThumbnails);

      } catch (error) {
        const err = error as Error;
        logger.warn(`Failed to load AttachmentHandler configuration, using defaults: ${err.message}`);
      }
    }
  }

  /**
   * Process content by finding and enhancing attachment links
   * @param content - Content to process
   * @param context - Parse context
   * @returns Content with enhanced attachments
   */
  async process(content: string, context: ParseContext): Promise<string> {
    if (!content) {
      return content;
    }

    const matches: AttachmentMatch[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.pattern.lastIndex = 0;

    while ((match = this.pattern.exec(content)) !== null) {
      matches.push({
        fullMatch: match[0],
        filename: (match[1] ?? '').trim(),
        displayText: match[2] ? match[2].trim() : null,
        parameters: match[3] ? match[3].trim() : null,
        index: match.index,
        length: match[0].length
      });
    }

    // Process matches in reverse order to maintain string positions
    let processedContent = content;

    for (let i = matches.length - 1; i >= 0; i--) {
      const matchInfo = matches[i];

      try {
        const replacement = await this.handleAttachment(matchInfo, context);

        processedContent =
          processedContent.slice(0, matchInfo.index) +
          replacement +
          processedContent.slice(matchInfo.index + matchInfo.length);

      } catch (error) {
        const err = error as Error;
        logger.error(`Attachment processing error for ${matchInfo.filename}: ${err.message}`);

        const errorPlaceholder = `<!-- Attachment Error: ${matchInfo.filename} - ${err.message} -->`;
        processedContent =
          processedContent.slice(0, matchInfo.index) +
          errorPlaceholder +
          processedContent.slice(matchInfo.index + matchInfo.length);
      }
    }

    return processedContent;
  }

  /**
   * Handle a specific attachment with enhanced features
   * @param matchInfo - Attachment match information
   * @param context - Parse context
   * @returns Enhanced attachment HTML
   */
  private async handleAttachment(matchInfo: AttachmentMatch, context: AttachmentParseContext): Promise<string> {
    const { filename, displayText, parameters } = matchInfo;

    // Check cache for attachment result if caching enabled
    if (this.options.cacheEnabled && this.attachmentConfig.cacheMetadata) {
      const cachedResult = await this.getCachedAttachmentResult(filename, context);
      if (cachedResult) {
        return cachedResult;
      }
    }

    // Validate attachment access permissions
    const hasAccess = await this.checkAttachmentPermission(filename, context);
    if (!hasAccess) {
      throw new Error(`Access denied to attachment: ${filename}`);
    }

    // Get attachment metadata
    const attachmentMeta = await this.getAttachmentMetadata(filename, context);
    if (!attachmentMeta) {
      throw new Error(`Attachment not found: ${filename}`);
    }

    // Parse additional parameters
    const linkParams = this.parseAttachmentParameters(parameters);

    // Generate enhanced attachment HTML based on configuration
    let attachmentHtml: string;

    if (this.isImageFile(filename) && this.attachmentConfig.thumbnails) {
      attachmentHtml = await this.generateImageAttachmentHtml(filename, displayText, attachmentMeta, linkParams, context);
    } else {
      attachmentHtml = this.generateFileAttachmentHtml(filename, displayText, attachmentMeta, linkParams);
    }

    // Cache the result if caching enabled
    if (this.options.cacheEnabled && this.attachmentConfig.cacheMetadata) {
      await this.cacheAttachmentResult(filename, context, attachmentHtml);
    }

    return attachmentHtml;
  }

  /**
   * Get attachment metadata with caching
   * @param filename - Attachment filename
   * @param context - Parse context
   * @returns Attachment metadata or null
   */
  private async getAttachmentMetadata(filename: string, context: AttachmentParseContext): Promise<AttachmentMetadata | null> {
    const attachmentManager = context.getManager('AttachmentManager') as AttachmentManager | undefined;
    if (!attachmentManager) {
      throw new Error('AttachmentManager not available');
    }

    try {
      // Get file information
      const attachmentPath = await attachmentManager.getAttachmentPath(filename);
      const stats = await fs.stat(attachmentPath);

      return {
        filename,
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
        type: this.getFileType(filename),
        isImage: this.isImageFile(filename),
        path: attachmentPath,
        url: `/attachments/${encodeURIComponent(filename)}`
      };

    } catch (error) {
      const err = error as Error;
      logger.warn(`Could not get metadata for ${filename}: ${err.message}`);
      return null;
    }
  }

  /**
   * Generate enhanced HTML for image attachments with thumbnails
   * @param filename - Image filename
   * @param displayText - Display text
   * @param metadata - File metadata
   * @param params - Link parameters
   * @param context - Parse context
   * @returns Image attachment HTML
   */
  private async generateImageAttachmentHtml(
    filename: string,
    displayText: string | null,
    metadata: AttachmentMetadata,
    params: LinkParams,
    context: AttachmentParseContext
  ): Promise<string> {
    const thumbnailUrl = await this.generateThumbnail(filename, metadata, context);
    const fullImageUrl = metadata.url;
    const altText = displayText || filename;

    let imageHtml = '<div class="attachment-image-container">';

    if (thumbnailUrl) {
      // Thumbnail with link to full image
      imageHtml += `
  <a href="${this.escapeHtml(fullImageUrl)}" class="attachment-image-link" data-filename="${this.escapeHtml(filename)}"${params.target ? ` target="${params.target}"` : ''}>
    <img src="${this.escapeHtml(thumbnailUrl)}" alt="${this.escapeHtml(altText)}" class="attachment-thumbnail">
  </a>`;
    } else {
      // Direct image link
      imageHtml += `
  <a href="${this.escapeHtml(fullImageUrl)}" class="attachment-image-link"${params.target ? ` target="${params.target}"` : ''}>
    <img src="${this.escapeHtml(fullImageUrl)}" alt="${this.escapeHtml(altText)}" class="attachment-image">
  </a>`;
    }

    // Add metadata if enabled
    if (this.attachmentConfig.metadata) {
      imageHtml += this.generateMetadataHtml(metadata);
    }

    imageHtml += '</div>';

    return imageHtml;
  }

  /**
   * Generate enhanced HTML for file attachments
   * @param filename - Attachment filename
   * @param displayText - Display text
   * @param metadata - File metadata
   * @param params - Link parameters
   * @returns File attachment HTML
   */
  private generateFileAttachmentHtml(
    filename: string,
    displayText: string | null,
    metadata: AttachmentMetadata,
    params: LinkParams
  ): string {
    const fileUrl = metadata.url;
    const linkText = displayText || filename;
    const fileIcon = this.getFileIcon(metadata.type);

    let fileHtml = '<div class="attachment-file-container">';

    // File icon and link
    fileHtml += `
  <a href="${this.escapeHtml(fileUrl)}" class="attachment-file-link" data-filename="${this.escapeHtml(filename)}"${params.target ? ` target="${params.target}"` : ''}>`;

    if (fileIcon) {
      fileHtml += `<img src="${this.attachmentConfig.iconPath}/${fileIcon}" alt="${metadata.type}" class="attachment-file-icon"> `;
    }

    fileHtml += `${this.escapeHtml(linkText)}</a>`;

    // Add metadata if enabled
    if (this.attachmentConfig.metadata) {
      fileHtml += this.generateMetadataHtml(metadata);
    }

    fileHtml += '</div>';

    return fileHtml;
  }

  /**
   * Generate metadata HTML display
   * @param metadata - File metadata
   * @returns Metadata HTML
   */
  private generateMetadataHtml(metadata: AttachmentMetadata): string {
    let metaHtml = '<div class="attachment-metadata">';

    if (this.attachmentConfig.showFileSize) {
      metaHtml += `<span class="attachment-size">${this.formatFileSize(metadata.size)}</span>`;
    }

    if (this.attachmentConfig.showModified) {
      metaHtml += `<span class="attachment-modified">${this.formatDate(metadata.modified)}</span>`;
    }

    metaHtml += `<span class="attachment-type">${metadata.type.toUpperCase()}</span>`;

    metaHtml += '</div>';

    return metaHtml;
  }

  /**
   * Generate thumbnail for image attachments (modular based on configuration)
   * @param filename - Image filename
   * @param metadata - File metadata
   * @param context - Parse context
   * @returns Thumbnail URL or null
   */
  private async generateThumbnail(
    filename: string,
    metadata: AttachmentMetadata,
    context: AttachmentParseContext
  ): Promise<string | null> {
    if (!this.attachmentConfig.generateThumbnails || !metadata.isImage) {
      return null;
    }

    try {
      // Use first configured thumbnail size
      const primarySize = this.attachmentConfig.thumbnailSizes[0] ?? '150x150';
      const thumbnailFilename = `thumb_${primarySize}_${filename}`;

      // Check if thumbnail already exists
      const attachmentManager = context.getManager('AttachmentManager') as AttachmentManager | undefined;
      if (attachmentManager) {
        const thumbnailExists = await attachmentManager.attachmentExists(thumbnailFilename);
        if (thumbnailExists) {
          return `/attachments/${encodeURIComponent(thumbnailFilename)}`;
        }

        // Generate thumbnail if it doesn't exist
        const thumbnailUrl = await this.createThumbnail(
          metadata.path, thumbnailFilename, primarySize, attachmentManager,
          // #1179: forward whoever this render is for. This used to be
          // `{ user: { username: 'system' } }` — a fabricated principal with no
          // `isAuthenticated`, so `checkPermission` denied it, `uploadAttachment`
          // threw, and `createThumbnail`'s catch turned that into a logged error
          // and a null. Thumbnails were not being generated on this path at all.
          //
          // Forwarding the viewer means a viewer without `asset-upload` still
          // gets no thumbnail — correct, and the narrower half of #1136:
          // rendering must not confer write powers the reader does not have.
          context.wikiContext?.userContext
        );
        return thumbnailUrl;
      }

    } catch (error) {
      const err = error as Error;
      logger.warn(`Failed to generate thumbnail for ${filename}: ${err.message}`);
    }

    return null;
  }

  /**
   * Create thumbnail using Sharp image processing library
   * @param sourcePath - Source image path
   * @param thumbnailFilename - Thumbnail filename
   * @param size - Size specification (e.g., '150x150')
   * @param attachmentManager - AttachmentManager instance
   * @returns Thumbnail URL or null on failure
   */
  private async createThumbnail(
    sourcePath: string,
    thumbnailFilename: string,
    size: string,
    attachmentManager: AttachmentManager,
    userContext: unknown
  ): Promise<string | null> {
    try {
      // Parse size (e.g., '150x150' -> width: 150, height: 150)
      const [widthStr, heightStr] = size.split('x');
      const width = parseInt(widthStr, 10) || 150;
      const height = parseInt(heightStr, 10) || 150;

      logger.debug(`Creating thumbnail: ${thumbnailFilename} (${width}x${height}) from ${sourcePath}`);

      // Check if source file exists
      try {
        await fs.access(sourcePath);
      } catch {
        logger.warn(`Source image not found for thumbnail: ${sourcePath}`);
        return null;
      }

      // Generate thumbnail using Sharp
      const thumbnailBuffer = await sharp(sourcePath)
        .resize(width, height, {
          fit: 'inside',           // Maintain aspect ratio, fit within dimensions
          withoutEnlargement: true // Don't upscale small images
        })
        .toBuffer();

      // Get the file extension for MIME type
      const ext = path.extname(thumbnailFilename).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.avif': 'image/avif',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff'
      };
      const mimeType = mimeTypes[ext] || 'image/jpeg';

      // Store thumbnail via AttachmentManager
      const result = await attachmentManager.uploadAttachment(
        thumbnailBuffer,
        {
          originalName: thumbnailFilename,
          mimeType: mimeType,
          size: thumbnailBuffer.length
        },
        {
          pageName: '_thumbnails', // System page for thumbnails
          // #1179: the render's own identity, forwarded, never rebuilt.
          context: userContext
        }
      );

      if (result && result.identifier) {
        logger.info(`Thumbnail created: ${thumbnailFilename} (${thumbnailBuffer.length} bytes)`);
        return `/attachments/${encodeURIComponent(result.identifier)}`;
      }

      return null;
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to create thumbnail ${thumbnailFilename}: ${err.message}`);
      return null;
    }
  }

  /**
   * Check if user has permission to access attachment (modular security)
   * @param filename - Attachment filename
   * @param context - Parse context
   * @returns True if access granted
   */
  private async checkAttachmentPermission(filename: string, context: AttachmentParseContext): Promise<boolean> {
    if (!this.attachmentConfig.securityChecks) {
      return true; // Security checks disabled
    }

    // Check basic authentication for sensitive files
    const fileExt = path.extname(filename).toLowerCase();
    const sensitiveExtensions = ['.exe', '.bat', '.sh', '.cmd', '.scr'];

    if (sensitiveExtensions.includes(fileExt) && !context.isAuthenticated()) {
      return false;
    }

    // Use PolicyManager for detailed permission checks
    const policyManager = context.getManager('PolicyManager') as PolicyManager | undefined;
    if (policyManager) {
      return await policyManager.checkPermission(
        context.wikiContext?.userContext,
        'attachment:read',
        filename
      );
    }

    // Default allow if no policy system
    return true;
  }

  /**
   * Parse attachment parameters (modular parameter system)
   * @param paramString - Parameter string
   * @returns Parsed parameters
   */
  private parseAttachmentParameters(paramString: string | null): LinkParams {
    if (!paramString) {
      return {};
    }

    const params: LinkParams = {};

    // Simple parameter parsing - can be enhanced
    const paramPairs = paramString.split(/\s+/);
    for (const pair of paramPairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        params[key] = value;
      }
    }

    return params;
  }

  /**
   * Check if file is an image (modular file type detection)
   * @param filename - Filename to check
   * @returns True if image file
   */
  private isImageFile(filename: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
    const ext = path.extname(filename).toLowerCase();
    return imageExtensions.includes(ext);
  }

  /**
   * Get file type from filename (modular type detection)
   * @param filename - Filename
   * @returns File type
   */
  private getFileType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();

    const typeMap: Record<string, string> = {
      '.pdf': 'PDF Document',
      '.doc': 'Word Document',
      '.docx': 'Word Document',
      '.xls': 'Excel Spreadsheet',
      '.xlsx': 'Excel Spreadsheet',
      '.ppt': 'PowerPoint Presentation',
      '.pptx': 'PowerPoint Presentation',
      '.txt': 'Text File',
      '.md': 'Markdown File',
      '.jpg': 'JPEG Image',
      '.jpeg': 'JPEG Image',
      '.png': 'PNG Image',
      '.gif': 'GIF Image',
      '.zip': 'ZIP Archive',
      '.tar': 'TAR Archive',
      '.gz': 'GZIP Archive'
    };

    return typeMap[ext] || 'Unknown File';
  }

  /**
   * Get file icon filename (modular icon system)
   * @param fileType - File type
   * @returns Icon filename
   */
  private getFileIcon(fileType: string): string {
    const iconMap: Record<string, string> = {
      'PDF Document': 'pdf.png',
      'Word Document': 'doc.png',
      'Excel Spreadsheet': 'xls.png',
      'PowerPoint Presentation': 'ppt.png',
      'Text File': 'txt.png',
      'Markdown File': 'md.png',
      'JPEG Image': 'image.png',
      'PNG Image': 'image.png',
      'GIF Image': 'image.png',
      'ZIP Archive': 'zip.png',
      'TAR Archive': 'archive.png',
      'GZIP Archive': 'archive.png'
    };

    return iconMap[fileType] || 'file.png';
  }

  /**
   * Format file size for display (modular formatting)
   * @param bytes - File size in bytes
   * @returns Formatted file size
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format date for display (modular date formatting)
   * @param date - Date to format
   * @returns Formatted date
   */
  private formatDate(date: Date): string {
    if (!date) return 'Unknown';

    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };

    return new Intl.DateTimeFormat('en-US', options).format(new Date(date));
  }

  /**
   * Get cached attachment result
   * @param filename - Attachment filename
   * @param context - Parse context
   * @returns Cached result or null
   */
  private async getCachedAttachmentResult(filename: string, context: AttachmentParseContext): Promise<string | null> {
    const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;
    if (!markupParser) {
      return null;
    }

    const contentHash = this.generateContentHash(filename);
    const contextHash = this.generateContextHash(context);

    return await markupParser.getCachedHandlerResult(this.handlerId, contentHash, contextHash);
  }

  /**
   * Cache attachment result
   * @param filename - Attachment filename
   * @param context - Parse context
   * @param result - HTML result to cache
   */
  private async cacheAttachmentResult(filename: string, context: AttachmentParseContext, result: string): Promise<void> {
    const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;
    if (!markupParser) {
      return;
    }

    const contentHash = this.generateContentHash(filename);
    const contextHash = this.generateContextHash(context);

    await markupParser.cacheHandlerResult(this.handlerId, contentHash, contextHash, result);
  }

  /**
   * Generate content hash for caching
   * @param content - Content to hash
   * @returns Content hash
   */
  private generateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Generate context hash for caching
   * @param context - Parse context
   * @returns Context hash
   */
  private generateContextHash(context: AttachmentParseContext): string {
    const contextData = {
      pageName: context.wikiContext?.pageName,
      userName: context.userName,
      authenticated: context.isAuthenticated(),
      // Attachment permissions may vary by user
      timeBucket: Math.floor(Date.now() / 1800000) // 30-minute buckets
    };

    return crypto.createHash('md5').update(JSON.stringify(contextData)).digest('hex');
  }

  /**
   * Escape HTML to prevent XSS (modular security)
   * @param text - Text to escape
   * @returns Escaped text
   */
  private escapeHtml(text: string): string {
    if (typeof text !== 'string') {
      return text;
    }

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Get configuration summary (for debugging and monitoring)
   * @returns Configuration summary
   */
  getConfigurationSummary(): Record<string, unknown> {
    return {
      handler: {
        enabled: this.config?.enabled || false,
        priority: this.priority,
        cacheEnabled: Boolean(this.options.cacheEnabled)
      },
      features: {
        enhanced: this.attachmentConfig?.enhanced || false,
        thumbnails: this.attachmentConfig?.thumbnails || false,
        metadata: this.attachmentConfig?.metadata || false,
        securityChecks: this.attachmentConfig?.securityChecks || true
      },
      settings: {
        thumbnailSizes: this.attachmentConfig?.thumbnailSizes || [],
        iconPath: this.attachmentConfig?.iconPath || '/icons/filetypes',
        cacheMetadata: this.attachmentConfig?.cacheMetadata || false
      }
    };
  }

  /**
   * Get supported attachment patterns
   * @returns Array of supported patterns
   */
  getSupportedPatterns(): string[] {
    return [
      '[{ATTACH filename.pdf}]',
      '[{ATTACH document.pdf|Important Document}]',
      '[{ATTACH image.jpg|Photo|target=_blank}]',
      '[{ATTACH spreadsheet.xlsx|Data Sheet|class=important}]'
    ];
  }

  /**
   * Get handler information for debugging and documentation
   * @returns Handler information
   */
  getInfo(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      supportedPatterns: this.getSupportedPatterns(),
      configuration: this.getConfigurationSummary(),
      features: [
        'Enhanced attachment linking',
        'Automatic thumbnail generation',
        'File metadata display',
        'Security permission validation',
        'Configurable file icons',
        'Multiple thumbnail sizes',
        'Performance caching',
        'XSS prevention',
        'Modular configuration system',
        'Hot-reload configuration support'
      ],
      supportedFileTypes: [
        'Images: JPG, PNG, GIF, WebP, SVG',
        'Documents: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX',
        'Text: TXT, MD',
        'Archives: ZIP, TAR, GZ'
      ]
    };
  }
}

export default AttachmentHandler;

