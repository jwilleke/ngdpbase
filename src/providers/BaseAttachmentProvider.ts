import logger from '../utils/logger.js';
import { AttachmentMetadata, AttachmentProvider } from '../types/index.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import { ProviderInfo } from './BasePageProvider.js';
import BaseProvider from './BaseProvider.js';

/**
 * File information for attachment uploads
 */
interface FileInfo {
  /** Original filename */
  originalName: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
}

/**
 * User information
 */
interface User {
  /** User identifier */
  id?: string;
  /** Username */
  username?: string;
  /** Email address */
  email?: string;
  [key: string]: unknown;
}

/**
 * Attachment retrieval result
 */
interface AttachmentResult {
  /** File buffer */
  buffer: Buffer;
  /** Attachment metadata */
  metadata: AttachmentMetadata;
}

/**
 * BaseAttachmentProvider - Abstract interface for attachment storage providers
 *
 * All attachment storage providers must extend this class and implement its methods.
 * Providers handle the actual storage and retrieval of wiki attachments (files, images, etc.),
 * whether from filesystem, database, cloud storage, or other backends.
 *
 * Following JSPWiki's attachment provider pattern.
 *
 * @class BaseAttachmentProvider
 * @abstract
 *
 * @property {WikiEngine} engine - Reference to the wiki engine
 * @property {boolean} initialized - Whether provider has been initialized
 *
 * @see {@link BasicAttachmentProvider} for filesystem implementation
 * @see {@link AttachmentManager} for usage
 */
abstract class BaseAttachmentProvider extends BaseProvider implements AttachmentProvider {
  /** Reference to the wiki engine */
  public engine: WikiEngine;

  /** Whether provider has been initialized */
  public initialized: boolean;

  /**
   * Create a new attachment provider
   *
   * @constructor
   * @param {WikiEngine} engine - The WikiEngine instance
   * @throws {Error} If engine is not provided
   */
  constructor(engine: WikiEngine) {
    super();
    if (!engine) {
      throw new Error('BaseAttachmentProvider requires an engine instance');
    }
    this.engine = engine;
    this.initialized = false;
  }

  /**
   * Initialize the provider
   *
   * IMPORTANT: Providers MUST access configuration via ConfigurationManager:
   *   const configManager = this.engine.getManager('ConfigurationManager');
   *   const value = configManager.getProperty('key', 'default');
   *
   * Do NOT read configuration files directly.
   *
   * @returns {Promise<void>}
   */
  abstract initialize(): Promise<void>;

  /**
   * Save attachment
   * @param {string} pageUuid - Page UUID
   * @param {string} filename - Filename
   * @param {Buffer} buffer - File buffer
   * @param {Record<string, any>} metadata - Additional metadata
   * @returns {Promise<AttachmentMetadata>} Attachment metadata
   */
  abstract saveAttachment(
    pageUuid: string,
    filename: string,
    buffer: Buffer,
    metadata?: Record<string, unknown>
  ): Promise<AttachmentMetadata>;

  /**
   * Upload/store an attachment with metadata (legacy method for backward compatibility)
   * @param {Buffer} fileBuffer - File data
   * @param {FileInfo} fileInfo - File information (originalName, mimeType, size)
   * @param {Partial<AttachmentMetadata>} _metadata - Attachment metadata
   * @param {User} _user - User uploading the attachment
   * @returns {Promise<AttachmentMetadata>} Attachment metadata with ID
   */
  storeAttachment(
    _fileBuffer: Buffer,
    _fileInfo: FileInfo,
    _metadata: Partial<AttachmentMetadata> = {},
    _user: User | null = null
  ): Promise<AttachmentMetadata> {
    throw new Error('storeAttachment() must be implemented by provider');
  }

  /**
   * Get attachment file data
   * @param {string} attachmentId - Attachment identifier
   * @returns {Promise<AttachmentResult|null>} File buffer and metadata
   */
  abstract getAttachment(attachmentId: string): Promise<AttachmentResult | null>;

  /**
   * Get attachment metadata only (no file data)
   * @param {string} attachmentId - Attachment identifier
   * @returns {Promise<AttachmentMetadata|null>} Attachment metadata
   */
  abstract getAttachmentMetadata(attachmentId: string): Promise<AttachmentMetadata | null>;

  /**
   * Update attachment metadata (e.g., add page reference)
   * @param {string} attachmentId - Attachment identifier
   * @param {Partial<AttachmentMetadata>} metadata - Updated metadata
   * @returns {Promise<boolean>} Success status
   */
  abstract updateAttachmentMetadata(
    attachmentId: string,
    metadata: Partial<AttachmentMetadata>
  ): Promise<boolean>;

  /**
   * Delete an attachment
   * @param {string} attachmentId - Attachment identifier
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  abstract deleteAttachment(attachmentId: string): Promise<boolean>;

  /**
   * Check if attachment exists
   * @param {string} attachmentId - Attachment identifier
   * @returns {Promise<boolean>}
   */
  abstract attachmentExists(attachmentId: string): Promise<boolean>;

  /**
   * Get all attachments metadata (without file data)
   * @returns {Promise<AttachmentMetadata[]>} Array of attachment metadata
   */
  abstract getAllAttachments(): Promise<AttachmentMetadata[]>;

  /**
   * Get attachments used by a specific page
   * @param {string} pageName - Page name/title
   * @returns {Promise<AttachmentMetadata[]>} Array of attachment metadata
   */
  abstract getAttachmentsForPage(pageName: string): Promise<AttachmentMetadata[]>;

  /**
   * List attachments for a page (AttachmentProvider interface method)
   * @param {string} pageUuid - Page UUID
   * @returns {Promise<AttachmentMetadata[]>} Array of attachment metadata
   */
  abstract listAttachments(pageUuid: string): Promise<AttachmentMetadata[]>;

  /**
   * Delete all attachments for a page
   * @param {string} pageUuid - Page UUID
   * @returns {Promise<number>} Number of attachments deleted
   */
  abstract deletePageAttachments(pageUuid: string): Promise<number>;

  /**
   * Find an attachment by its original filename across all attachments
   * @param {string} filename - Original filename to search for
   * @returns {Promise<AttachmentMetadata|null>} Matching attachment metadata or null
   */
  async getAttachmentByFilename(_filename: string): Promise<AttachmentMetadata | null> {
    return null;
  }

  /**
   * Refresh internal cache/index
   * Re-scans storage and rebuilds indexes
   * @returns {Promise<void>}
   */
  abstract refreshAttachmentList(): Promise<void>;

  /**
   * Get provider information
   * @returns {ProviderInfo} Provider metadata
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'BaseAttachmentProvider',
      version: '1.0.0',
      description: 'Abstract base attachment provider',
      features: []
    };
  }

  /**
   * Backup provider data
   * Returns all metadata needed to restore attachments
   * @returns {Promise<Record<string, unknown>>} Backup data
   */
  abstract backup(): Promise<Record<string, unknown>>;

  /**
   * Restore provider data from backup
   * @param {Record<string, unknown>} backupData - Backup data from backup()
   * @returns {Promise<void>}
   */
  abstract restore(backupData: Record<string, unknown>): Promise<void>;

  /**
   * Shutdown the provider (cleanup resources)
   * @returns {Promise<void>}
   */
  async shutdown(): Promise<void> {
    this.initialized = false;
    logger.info(`${this.getProviderInfo().name} shut down`);
  }
}

export default BaseAttachmentProvider;
export { FileInfo, User, AttachmentResult };

