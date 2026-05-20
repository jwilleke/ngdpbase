import BaseAttachmentProvider, { FileInfo, User, AttachmentResult } from './BaseAttachmentProvider.js';
import { AttachmentMetadata } from '../types/index.js';
import type { AssetProvider, AssetRecord, AssetQuery, AssetPage, AssetInput, AssetMetadata } from '../types/Asset.js';
import type { CreativeWork, DigitalDocument } from '../types/Schema.js';
import sharp from 'sharp';
import { ExifTool } from 'exiftool-vendored';
import { transformImage, parseSize } from '../utils/imageTransform.js';
import fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';

/**
 * Schema.org Person metadata
 */
interface SchemaPerson {
  '@type': 'Person';
  name: string;
  email?: string;
}

/**
 * Schema.org mention reference
 */
interface SchemaMention {
  '@type'?: 'Thing';
  name?: string;
  url?: string;
}

/**
 * Schema.org CreativeWork metadata for attachments
 */
interface SchemaCreativeWork {
  '@context': 'https://schema.org';
  '@type': 'CreativeWork';
  identifier: string;
  name: string;
  description?: string;
  author?: SchemaPerson;
  editor?: SchemaPerson;
  dateCreated: string;
  dateModified: string;
  encodingFormat: string;
  contentSize: number;
  url: string;
  storageLocation: string;
  isFamilyFriendly?: boolean;
  isBasedOn?: string;
  mentions: SchemaMention[];
  /** Whether this attachment belongs to a private page */
  isPrivate?: boolean;
  /** Username of the page creator; set when isPrivate is true */
  creator?: string;
  /** Structured metadata extracted at upload time (EXIF via sharp) — Phase 5 #405 */
  assetMetadata?: AssetMetadata;
  // --- PDF / docx embedded document metadata (Slice 5 of #755 / #759) ---
  /** Title embedded in the document (PDF /Info Title; docx core.xml dc:title). Distinct from the uploaded filename. */
  documentTitle?: string;
  /** Author embedded in the document (PDF /Info Author; docx dc:creator). Distinct from the uploader's user. */
  documentAuthor?: string;
  /** Subject / abstract embedded in the document (PDF /Info Subject; docx dc:description). */
  documentSubject?: string;
  /** Keywords / tags embedded in the document (PDF /Info Keywords; docx dc:subject). String array, deduplicated. */
  documentKeywords?: string[];
  /** Document's own CreationDate (when the file was first authored). Distinct from upload time. */
  documentDateCreated?: string;
  /** Document's own ModDate (last edit before upload). Distinct from upload time. */
  documentDateModified?: string;
  /** BCP-47 language tag from the document (PDF /Lang; docx core.xml dc:language). */
  inLanguage?: string;
}

/**
 * Options passed to storeAttachmentInternal for privacy-aware storage
 */
interface StoreAttachmentOptions {
  /** Whether the linked page is private */
  isPrivatePage?: boolean;
  /** Username of the private page creator */
  pageCreator?: string;
}

/**
 * Metadata file structure
 */
interface MetadataFile {
  '@context': 'https://schema.org';
  '@type': 'ItemList';
  name: string;
  description: string;
  attachments: SchemaCreativeWork[];
}

/**
 * Backup data structure
 */
interface BackupData extends Record<string, unknown> {
  providerName: string;
  timestamp: string;
  metadataFile: string;
  storageDirectory: string;
  attachments: Array<[string, SchemaCreativeWork]>;
}

/**
 * Provider information
 */
interface ProviderInfo {
  name: string;
  version: string;
  description: string;
  features: string[];
}

/**
 * MIME type lookup table for disk-scan orphan fallback.
 * Used only when an attachment file exists on disk but has no metadata record.
 */
const EXTENSION_MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.zip': 'application/zip'
};

/**
 * BasicAttachmentProvider - Filesystem-based attachment storage
 *
 * Implements attachment storage using filesystem with Schema.org CreativeWork metadata.
 * Attachments are stored in a shared directory structure, not tied to individual pages.
 * Page references are tracked via the "mentions" array in metadata.
 *
 * Based on JSPWiki's BasicAttachmentProvider:
 * https://github.com/apache/jspwiki/blob/master/jspwiki-main/src/main/java/org/apache/wiki/providers/BasicAttachmentProvider.java
 *
 * Features:
 * - Filesystem storage with SHA-256 content hashing
 * - Schema.org CreativeWork metadata format
 * - Shared storage model with page mentions tracking
 * - Automatic metadata persistence
 * - Backup/restore support
 */
class BasicAttachmentProvider extends BaseAttachmentProvider implements AssetProvider {
  private storageDirectory: string | null;
  private privateStorageDir: string | null;
  private thumbDir: string | null;
  private metadataFile: string | null;
  private attachmentMetadata: Map<string, SchemaCreativeWork>;
  private maxFileSize: number;
  private allowedMimeTypes: string[];
  private hashMethod: string;

  /**
   * Lazily-instantiated ExifTool worker (Slice 5 of #755 / #759).
   * Used to extract embedded document metadata from PDFs / docx at upload
   * time. Created on first use to avoid spawning a perl process when the
   * provider initialises but never sees a PDF or docx upload.
   */
  private _exiftool: ExifTool | null = null;
  private exiftool(): ExifTool {
    if (!this._exiftool) {
      this._exiftool = new ExifTool({ taskTimeoutMillis: 15000, maxProcs: 1 });
    }
    return this._exiftool;
  }

  /**
   * MIME types that carry extractable document metadata.
   * exiftool reads both via its PDF / OOXML modules.
   */
  private static readonly DOC_METADATA_MIME_TYPES: ReadonlySet<string> = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation' // .pptx
  ]);

  constructor(engine: WikiEngine) {
    super(engine);
    this.storageDirectory = null;
    this.privateStorageDir = null;
    this.thumbDir = null;
    this.metadataFile = null;
    this.attachmentMetadata = new Map();
    this.maxFileSize = 10 * 1024 * 1024; // 10MB default
    this.allowedMimeTypes = []; // Empty = allow all
    this.hashMethod = 'sha256';
  }

  /**
   * Initialize the provider
   * All configuration access via ConfigurationManager
   */
  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('BasicAttachmentProvider requires ConfigurationManager');
    }

    // Get storage directory configuration (ALL LOWERCASE)
    // Uses getResolvedDataPath to support INSTANCE_DATA_FOLDER
    this.storageDirectory = configManager.getResolvedDataPath(
      'ngdpbase.attachment.provider.basic.storagedir',
      './data/attachments'
    );

    // Get metadata file location (ALL LOWERCASE)
    // Uses getResolvedDataPath to support INSTANCE_DATA_FOLDER
    this.metadataFile = configManager.getResolvedDataPath(
      'ngdpbase.attachment.metadatafile',
      './data/attachments/attachment-metadata.json'
    );

    // Get size limits and allowed types from shared config (ALL LOWERCASE)
    const maxSizeBytes: number = configManager.getProperty(
      'ngdpbase.attachment.maxsize',
      10485760
    ) as number;
    this.maxFileSize = maxSizeBytes;

    const allowedTypesStr: string = configManager.getProperty(
      'ngdpbase.attachment.allowedtypes',
      ''
    ) as string;
    this.allowedMimeTypes = allowedTypesStr
      ? allowedTypesStr.split(',').map((t: string) => t.trim())
      : [];

    // Get provider-specific settings (ALL LOWERCASE)
    this.hashMethod = configManager.getProperty(
      'ngdpbase.attachment.provider.basic.hashmethod',
      'sha256'
    ) as string;

    // Derive private storage and thumbnail subdirectories
    this.privateStorageDir = path.join(this.storageDirectory, 'private');
    this.thumbDir = path.join(this.storageDirectory, '.thumbs');

    // Ensure directories exist
    await fs.ensureDir(this.storageDirectory);
    await fs.ensureDir(path.dirname(this.metadataFile));

    logger.info(`[BasicAttachmentProvider] Storage directory: ${this.storageDirectory}`);
    logger.info(`[BasicAttachmentProvider] Metadata file: ${this.metadataFile}`);
    logger.info(`[BasicAttachmentProvider] Max file size: ${this.formatSize(this.maxFileSize)}`);
    logger.info(`[BasicAttachmentProvider] Hash method: ${this.hashMethod}`);

    // Load metadata
    await this.loadMetadata();

    // Auto-correct stale storageLocation paths after a data migration.
    // If any entry's directory no longer matches the configured storageDirectory,
    // rewrite it in place and persist — prevents 404s without any manual intervention.
    await this.migrateStaleStoragePaths();

    this.initialized = true;
    logger.info(`[BasicAttachmentProvider] Initialized with ${this.attachmentMetadata.size} attachments.`);
  }


  /**
   * Verify that the attachment storage directory is accessible.
   *
   * Returns false when the directory cannot be read — e.g. a NAS or SLOW_STORAGE
   * volume that has been unmounted or an SMB share that has dropped.  AssetManager
   * uses this to skip the provider during fan-out rather than surfacing I/O errors
   * to end users.
   */
  async healthCheck(): Promise<boolean> {
    if (!this.storageDirectory) {
      // Not yet initialized — report degraded so the manager skips us
      return false;
    }
    try {
      await fs.access(this.storageDirectory, fs.constants.R_OK);
      return true;
    } catch (err) {
      logger.warn(`[BasicAttachmentProvider] healthCheck failed — storage directory unreachable: ${this.storageDirectory}`, err);
      return false;
    }
  }

  /**
   * Format bytes to human-readable size
   * @param bytes - Size in bytes
   * @returns Formatted size
   * @private
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /**
   * Rewrite stale storageLocation paths after a data migration.
   *
   * Compares each entry's directory against the current storageDirectory.
   * If they differ, the absolute path is replaced with the correct one
   * (preserving the basename/hash filename) and metadata is saved once.
   * Private attachments are corrected to their per-creator subdirectory.
   */
  private async migrateStaleStoragePaths(): Promise<void> {
    if (!this.storageDirectory) return;

    let migrated = 0;
    for (const [, entry] of this.attachmentMetadata) {
      const basename = path.basename(entry.storageLocation);
      const expectedDir = (entry.isPrivate && entry.creator && this.privateStorageDir)
        ? path.join(this.privateStorageDir, entry.creator)
        : this.storageDirectory;
      const expectedPath = path.join(expectedDir, basename);

      if (entry.storageLocation !== expectedPath) {
        entry.storageLocation = expectedPath;
        migrated++;
      }
    }

    if (migrated > 0) {
      logger.warn(`[BasicAttachmentProvider] Migrated ${migrated} stale attachment path(s) to ${this.storageDirectory}`);
      await this.saveMetadata();
    }
  }

  /**
   * Load metadata from JSON file
   * @private
   */
  private async loadMetadata(): Promise<void> {
    try {
      if (!this.metadataFile) {
        throw new Error('Metadata file path not initialized');
      }

      if (!await fs.pathExists(this.metadataFile)) {
        this.attachmentMetadata = new Map();
        logger.info('[BasicAttachmentProvider] No existing metadata file, starting fresh');
        return;
      }

      const data = await fs.readFile(this.metadataFile, 'utf8' as BufferEncoding);
      const json: MetadataFile = JSON.parse(data) as MetadataFile;

      // Validate Schema.org format
      if (!json['@context'] || json['@context'] !== 'https://schema.org') {
        throw new Error('Invalid metadata file: missing or incorrect @context');
      }

      if (!json.attachments || !Array.isArray(json.attachments)) {
        throw new Error('Invalid metadata file: missing or invalid attachments array');
      }

      // Load into Map
      this.attachmentMetadata.clear();
      for (const attachment of json.attachments) {
        if (attachment.identifier) {
          this.attachmentMetadata.set(attachment.identifier, attachment);
        }
      }

      logger.info(`[BasicAttachmentProvider] Loaded ${this.attachmentMetadata.size} attachment metadata entries`);
    } catch (error: unknown) {
      logger.error('[BasicAttachmentProvider] Failed to load metadata:', error);
      this.attachmentMetadata = new Map();
    }
  }

  /**
   * Save metadata to JSON file
   * @private
   */
  private async saveMetadata(): Promise<void> {
    try {
      if (!this.metadataFile) {
        throw new Error('Metadata file path not initialized');
      }

      const json: MetadataFile = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'name': 'ngdpbase Attachments',
        'description': 'Metadata for all attachments in the wiki',
        'attachments': Array.from(this.attachmentMetadata.values())
      };

      await fs.writeFile(this.metadataFile, JSON.stringify(json, null, 2), 'utf8' as BufferEncoding);
      logger.info('[BasicAttachmentProvider] Metadata saved successfully');
    } catch (error: unknown) {
      logger.error('[BasicAttachmentProvider] Failed to save metadata:', error);
      throw error;
    }
  }

  /**
   * Generate unique attachment ID using SHA-256 hash of content
   * @param buffer - File data
   * @returns Attachment ID (hash)
   * @private
   */
  private generateAttachmentId(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Validate file against constraints
   * @param fileInfo - File information
   * @private
   */
  private validateFile(fileInfo: FileInfo): void {
    if (!fileInfo.size || fileInfo.size === 0) {
      throw new Error('File is empty');
    }

    if (fileInfo.size > this.maxFileSize) {
      throw new Error(`File too large. Maximum size: ${this.formatSize(this.maxFileSize)}`);
    }

    // Check MIME type if restrictions are configured
    if (this.allowedMimeTypes.length > 0) {
      const isAllowed = this.allowedMimeTypes.some((pattern: string) => {
        if (pattern.endsWith('/*')) {
          const prefix = pattern.slice(0, -2);
          return fileInfo.mimeType.startsWith(prefix);
        }
        return fileInfo.mimeType === pattern;
      });

      if (!isAllowed) {
        throw new Error(`File type '${fileInfo.mimeType}' not allowed. Allowed types: ${this.allowedMimeTypes.join(', ')}`);
      }
    }
  }

  /**
   * Store an attachment with metadata (internal method using Schema.org format)
   * @param fileBuffer - File data
   * @param fileInfo - { originalName, mimeType, size }
   * @param metadata - Schema.org CreativeWork metadata
   * @param user - User object { name, email }
   * @param options - Privacy-aware storage options
   * @returns Complete attachment metadata
   * @private
   */
  private async storeAttachmentInternal(
    fileBuffer: Buffer,
    fileInfo: FileInfo,
    metadata: Partial<SchemaCreativeWork> = {},
    user: User | null = null,
    options: StoreAttachmentOptions = {}
  ): Promise<SchemaCreativeWork> {
    // Validate file
    this.validateFile(fileInfo);

    // Generate content-based ID
    const attachmentId = this.generateAttachmentId(fileBuffer);

    // Check if attachment already exists (deduplication)
    const existing = this.attachmentMetadata.get(attachmentId);
    if (existing) {
      logger.info(`[BasicAttachmentProvider] Attachment already exists: ${attachmentId} (${fileInfo.originalName})`);
      return existing;
    }

    if (!this.storageDirectory) {
      throw new Error('Storage directory not initialized');
    }

    // Determine target directory: private pages get per-creator subdirectory
    const isPrivatePage = options.isPrivatePage ?? false;
    const pageCreator = options.pageCreator;
    const targetDir =
      isPrivatePage && pageCreator && this.privateStorageDir
        ? path.join(this.privateStorageDir, pageCreator)
        : this.storageDirectory;

    // Ensure target directory exists (private dir may not yet exist)
    await fs.ensureDir(targetDir);

    // Determine file extension from original name
    const ext = path.extname(fileInfo.originalName) || '';
    const fileName = `${attachmentId}${ext}`;
    const filePath = path.join(targetDir, fileName);

    // Write file to storage
    await fs.writeFile(filePath, fileBuffer);

    // Slice 5 of #755 (#759) — extract embedded document metadata for PDFs / docx.
    // Non-critical: failures log and continue without the embedded fields.
    const docMetadata = await this.extractDocMetadata(filePath, fileInfo.mimeType);

    // Create Schema.org CreativeWork metadata
    const now = new Date().toISOString();
    const author: SchemaPerson | undefined = user ? {
      '@type': 'Person',
      'name': user.username || user.email || 'Unknown',
      'email': user.email
    } : undefined;

    const attachmentMetadata: SchemaCreativeWork = {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      'identifier': attachmentId,
      'name': fileInfo.originalName,
      'description': metadata.description || '',
      'author': author,
      'editor': author, // Initially same as author
      'dateCreated': now,
      'dateModified': now,
      'encodingFormat': fileInfo.mimeType,
      'contentSize': fileInfo.size,
      'url': `/attachments/${attachmentId}`,
      'storageLocation': filePath,
      'isFamilyFriendly': metadata.isFamilyFriendly !== undefined ? metadata.isFamilyFriendly : true,
      'isBasedOn': metadata.isBasedOn,
      'mentions': [], // Array of pages using this attachment
      'isPrivate': isPrivatePage,
      'creator': isPrivatePage && pageCreator ? pageCreator : undefined,
      'assetMetadata': (metadata).assetMetadata,
      // Slice 5 of #755 (#759) — embedded document metadata, spread only when present.
      ...(docMetadata?.title ? { documentTitle: docMetadata.title } : {}),
      ...(docMetadata?.author ? { documentAuthor: docMetadata.author } : {}),
      ...(docMetadata?.subject ? { documentSubject: docMetadata.subject } : {}),
      ...(docMetadata?.keywords ? { documentKeywords: docMetadata.keywords } : {}),
      ...(docMetadata?.dateCreated ? { documentDateCreated: docMetadata.dateCreated } : {}),
      ...(docMetadata?.dateModified ? { documentDateModified: docMetadata.dateModified } : {}),
      ...(docMetadata?.inLanguage ? { inLanguage: docMetadata.inLanguage } : {})
    };

    // Store metadata
    this.attachmentMetadata.set(attachmentId, attachmentMetadata);
    await this.saveMetadata();

    logger.info(`[BasicAttachmentProvider] Stored attachment: ${fileInfo.originalName} (${attachmentId})${isPrivatePage ? ` [private, creator: ${pageCreator ?? 'unknown'}]` : ''}`);
    return attachmentMetadata;
  }

  /**
   * Store an attachment with metadata (BaseAttachmentProvider interface method)
   * @param fileBuffer - File data
   * @param fileInfo - { originalName, mimeType, size }
   * @param metadata - Attachment metadata
   * @param user - User object
   * @returns Attachment metadata
   */
  async storeAttachment(
    fileBuffer: Buffer,
    fileInfo: FileInfo,
    metadata: Partial<AttachmentMetadata> = {},
    user: User | null = null
  ): Promise<AttachmentMetadata> {
    // Extract privacy options from metadata (passed by AttachmentManager)
    const storeOptions: StoreAttachmentOptions = {
      isPrivatePage: metadata.isPrivatePage as boolean | undefined,
      pageCreator: metadata.pageCreator as string | undefined
    };

    const schemaMetadata = await this.storeAttachmentInternal(
      fileBuffer,
      fileInfo,
      metadata as Partial<SchemaCreativeWork>,
      user,
      storeOptions
    );

    // Convert Schema.org format to AttachmentMetadata
    const attachmentMetadata: AttachmentMetadata = {
      identifier: schemaMetadata.identifier,
      id: schemaMetadata.identifier,
      name: schemaMetadata.name,
      filename: schemaMetadata.name,
      pageUuid: metadata.pageUuid || '',
      encodingFormat: schemaMetadata.encodingFormat,
      mimeType: schemaMetadata.encodingFormat,
      contentSize: schemaMetadata.contentSize,
      size: schemaMetadata.contentSize,
      url: `/attachments/${schemaMetadata.identifier}`,
      uploadedAt: schemaMetadata.dateCreated,
      uploadedBy: schemaMetadata.author?.name || 'Unknown',
      filePath: schemaMetadata.storageLocation,
      description: schemaMetadata.description,
      isPrivate: schemaMetadata.isPrivate,
      creator: schemaMetadata.creator
    };

    // Add page mention if pageUuid is provided
    if (metadata.pageUuid) {
      const pageMention: SchemaMention = {
        '@type': 'Thing',
        name: metadata.pageUuid,
        url: `/pages/${metadata.pageUuid}`
      };

      if (!schemaMetadata.mentions.some(m => m.name === metadata.pageUuid)) {
        schemaMetadata.mentions.push(pageMention);
        await this.saveMetadata();
      }
    }

    return attachmentMetadata;
  }

  /**
   * Save attachment (AttachmentProvider interface method - alternative signature)
   * @param pageUuid - Page UUID
   * @param filename - Filename
   * @param buffer - File buffer
   * @param metadata - Additional metadata
   * @returns Attachment metadata
   */
  async saveAttachment(
    pageUuid: string,
    filename: string,
    buffer: Buffer,
    metadata: Record<string, unknown> = {}
  ): Promise<AttachmentMetadata> {
    const fileInfo: FileInfo = {
      originalName: filename,
      mimeType: (metadata.mimeType as string) || 'application/octet-stream',
      size: buffer.length
    };

    const user: User | null = metadata.uploadedBy ? {
      id: metadata.uploadedBy as string,
      username: metadata.uploadedBy as string,
      email: metadata.email as string
    } : null;

    const schemaMetadata = await this.storeAttachmentInternal(buffer, fileInfo, metadata, user);

    // Convert Schema.org format to AttachmentMetadata
    const attachmentMetadata: AttachmentMetadata = {
      identifier: schemaMetadata.identifier,
      id: schemaMetadata.identifier,
      name: schemaMetadata.name,
      filename: schemaMetadata.name,
      pageUuid: pageUuid,
      encodingFormat: schemaMetadata.encodingFormat,
      mimeType: schemaMetadata.encodingFormat,
      contentSize: schemaMetadata.contentSize,
      size: schemaMetadata.contentSize,
      url: `/attachments/${schemaMetadata.identifier}`,
      uploadedAt: schemaMetadata.dateCreated,
      uploadedBy: schemaMetadata.author?.name || 'Unknown',
      filePath: schemaMetadata.storageLocation,
      description: schemaMetadata.description
    };

    // Add page mention
    const pageMention: SchemaMention = {
      '@type': 'Thing',
      name: pageUuid,
      url: `/pages/${pageUuid}`
    };

    if (!schemaMetadata.mentions.some(m => m.name === pageUuid)) {
      schemaMetadata.mentions.push(pageMention);
      await this.saveMetadata();
    }

    return attachmentMetadata;
  }

  /**
   * Get attachment file and metadata
   *
   * Falls back to a disk scan when metadata is missing but a file matching
   * `{attachmentId}.*` exists in the storage directory (orphaned file). This
   * handles the case where attachment metadata was lost without requiring a
   * data repair before the file can be served. A warning is logged so operators
   * know the metadata repair is still needed.
   *
   * @param attachmentId - Attachment identifier
   * @returns File buffer and metadata or null
   */
  async getAttachment(attachmentId: string): Promise<AttachmentResult | null> {
    const metadata = this.attachmentMetadata.get(attachmentId);
    if (!metadata) {
      return this.getOrphanedAttachment(attachmentId);
    }

    // Derive the file path from the configured storage directory (via ConfigurationManager)
    // rather than trusting metadata.storageLocation, which may point to a stale path
    // (e.g. an old NAS mount after data migration).
    const basename = path.basename(metadata.storageLocation);
    let filePath: string;
    if (this.storageDirectory) {
      if (metadata.isPrivate && metadata.creator && this.privateStorageDir) {
        filePath = path.join(this.privateStorageDir, metadata.creator, basename);
      } else {
        filePath = path.join(this.storageDirectory, basename);
      }
    } else {
      filePath = metadata.storageLocation;
    }

    try {
      const buffer = await fs.readFile(filePath);

      // Convert to AttachmentResult with AttachmentMetadata format
      const attachmentMetadata: AttachmentMetadata = {
        identifier: metadata.identifier,
        id: metadata.identifier,
        name: metadata.name,
        filename: metadata.name,
        pageUuid: metadata.mentions[0]?.name || '',
        encodingFormat: metadata.encodingFormat,
        mimeType: metadata.encodingFormat,
        contentSize: metadata.contentSize,
        size: metadata.contentSize,
        url: `/attachments/${metadata.identifier}`,
        uploadedAt: metadata.dateCreated,
        uploadedBy: metadata.author?.name || 'Unknown',
        filePath,
        description: metadata.description
      };

      return { buffer, metadata: attachmentMetadata };
    } catch (error: unknown) {
      logger.error(`[BasicAttachmentProvider] Failed to read attachment file: ${attachmentId} at ${filePath}`, error);
      return null;
    }
  }

  /**
   * Disk-scan fallback for orphaned attachment files (file on disk, no metadata record).
   * @param attachmentId - Attachment identifier (SHA-256 hash)
   * @returns File buffer and synthetic metadata, or null if not found
   * @private
   */
  private async getOrphanedAttachment(attachmentId: string): Promise<AttachmentResult | null> {
    if (!this.storageDirectory) {
      logger.warn(`[BasicAttachmentProvider] Attachment not found: ${attachmentId}`);
      return null;
    }

    try {
      const files = await fs.readdir(this.storageDirectory);
      const match = files.find(f => f.startsWith(attachmentId + '.') || f === attachmentId);
      if (!match) {
        logger.warn(`[BasicAttachmentProvider] Attachment not found: ${attachmentId}`);
        return null;
      }

      const ext = path.extname(match).toLowerCase();
      const mimeType = EXTENSION_MIME_MAP[ext] || 'application/octet-stream';
      logger.warn(
        `[BasicAttachmentProvider] Serving orphaned file without metadata: ${match} (${mimeType}) — metadata repair needed`
      );

      const filePath = path.join(this.storageDirectory, match);
      const buffer = await fs.readFile(filePath);

      const attachmentMetadata: AttachmentMetadata = {
        id: attachmentId,
        identifier: attachmentId,
        name: match,                // route uses metadata.name for Content-Disposition
        filename: match,
        pageUuid: '',
        encodingFormat: mimeType,   // route uses metadata.encodingFormat for Content-Type
        mimeType,
        contentSize: buffer.length, // route uses metadata.contentSize for Content-Length
        size: buffer.length,
        url: `/attachments/${attachmentId}`,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'Unknown',
        filePath
      };

      return { buffer, metadata: attachmentMetadata };
    } catch (error: unknown) {
      logger.error(`[BasicAttachmentProvider] Error during orphan fallback scan: ${attachmentId}`, error);
      return null;
    }
  }

  /**
   * Get attachment metadata only
   * @param attachmentId - Attachment identifier
   * @returns Attachment metadata or null
   */
  getAttachmentMetadata(attachmentId: string): Promise<AttachmentMetadata | null> {
    const schemaMetadata = this.attachmentMetadata.get(attachmentId);
    if (!schemaMetadata) {
      return Promise.resolve(null);
    }

    // Convert to AttachmentMetadata format
    const attachmentMetadata: AttachmentMetadata = {
      id: schemaMetadata.identifier,
      filename: schemaMetadata.name,
      pageUuid: schemaMetadata.mentions[0]?.name || '',
      mimeType: schemaMetadata.encodingFormat,
      size: schemaMetadata.contentSize,
      uploadedAt: schemaMetadata.dateCreated,
      uploadedBy: schemaMetadata.author?.name || 'Unknown',
      filePath: schemaMetadata.storageLocation,
      description: schemaMetadata.description,
      isPrivate: schemaMetadata.isPrivate,
      creator: schemaMetadata.creator,
      mentions: schemaMetadata.mentions
    };

    return Promise.resolve(attachmentMetadata);
  }

  /**
   * Update attachment metadata
   * @param attachmentId - Attachment identifier
   * @param updates - Metadata updates
   * @returns Success status
   */
  async updateAttachmentMetadata(attachmentId: string, updates: Partial<AttachmentMetadata>): Promise<boolean> {
    const metadata = this.attachmentMetadata.get(attachmentId);
    if (!metadata) {
      logger.warn(`[BasicAttachmentProvider] Cannot update - attachment not found: ${attachmentId}`);
      return false;
    }

    // Update metadata
    if (updates.description !== undefined) {
      metadata.description = updates.description;
    }
    if (updates.filename !== undefined) {
      metadata.name = updates.filename;
    }
    metadata.dateModified = new Date().toISOString();

    this.attachmentMetadata.set(attachmentId, metadata);
    await this.saveMetadata();

    logger.info(`[BasicAttachmentProvider] Updated metadata for: ${attachmentId}`);
    return true;
  }

  /**
   * Delete an attachment
   * @param attachmentId - Attachment identifier
   * @returns True if deleted, false if not found
   */
  async deleteAttachment(attachmentId: string): Promise<boolean> {
    const metadata = this.attachmentMetadata.get(attachmentId);
    if (!metadata) {
      logger.warn(`[BasicAttachmentProvider] Cannot delete - attachment not found: ${attachmentId}`);
      return false;
    }

    try {
      // Delete file
      await fs.unlink(metadata.storageLocation);

      // Remove metadata
      this.attachmentMetadata.delete(attachmentId);
      await this.saveMetadata();

      logger.info(`[BasicAttachmentProvider] Deleted attachment: ${attachmentId} (${metadata.name})`);
      return true;
    } catch (error: unknown) {
      logger.error(`[BasicAttachmentProvider] Failed to delete attachment: ${attachmentId}`, error);
      return false;
    }
  }

  /**
   * Check if attachment exists
   * @param attachmentId - Attachment identifier
   * @returns True if exists
   */
  attachmentExists(attachmentId: string): Promise<boolean> {
    return Promise.resolve(this.attachmentMetadata.has(attachmentId));
  }

  /**
   * Get all attachments metadata
   * @returns Array of attachment metadata
   */
  getAllAttachments(): Promise<AttachmentMetadata[]> {
    const schemaAttachments = Array.from(this.attachmentMetadata.values())
      .sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime());

    return Promise.resolve(schemaAttachments.map((schema): AttachmentMetadata => ({
      // Required identifier from schema
      identifier: schema.identifier,
      // Legacy shape kept so existing callers don't break
      id: schema.identifier,
      filename: schema.name,
      name: schema.name,
      pageUuid: schema.mentions[0]?.name || '',
      mimeType: schema.encodingFormat,
      encodingFormat: schema.encodingFormat,
      size: schema.contentSize,
      uploadedAt: schema.dateCreated,
      uploadedBy: schema.author?.name || 'Unknown',
      filePath: schema.storageLocation,
      description: schema.description,
      // Slice 5 of #755 (#759) — embedded document metadata fields surfaced
      // for CatalogSource.list() consumers (and any other AttachmentMetadata
      // caller that wants doc-level Title/Author/Keywords).
      ...(schema.documentTitle ? { documentTitle: schema.documentTitle } : {}),
      ...(schema.documentAuthor ? { documentAuthor: schema.documentAuthor } : {}),
      ...(schema.documentSubject ? { documentSubject: schema.documentSubject } : {}),
      ...(schema.documentKeywords ? { documentKeywords: schema.documentKeywords } : {}),
      ...(schema.documentDateCreated ? { documentDateCreated: schema.documentDateCreated } : {}),
      ...(schema.documentDateModified ? { documentDateModified: schema.documentDateModified } : {}),
      ...(schema.inLanguage ? { inLanguage: schema.inLanguage } : {})
    })));
  }

  /**
   * Get attachments used by a specific page
   * @param pageName - Page name/title
   * @returns Array of attachment metadata
   */
  getAttachmentsForPage(pageName: string): Promise<AttachmentMetadata[]> {
    const attachments: SchemaCreativeWork[] = [];
    const allMetadata = Array.from(this.attachmentMetadata.values());
    for (const metadata of allMetadata) {
      if (metadata.mentions && Array.isArray(metadata.mentions)) {
        const hasPage = metadata.mentions.some((mention: SchemaMention) =>
          mention.name === pageName || mention.url?.includes(pageName)
        );
        if (hasPage) {
          attachments.push(metadata);
        }
      }
    }

    const sortedAttachments = attachments.sort(
      (a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
    );

    return Promise.resolve(sortedAttachments.map((schema): AttachmentMetadata => ({
      identifier: schema.identifier,
      id: schema.identifier,
      name: schema.name,
      filename: schema.name,
      pageUuid: pageName,
      encodingFormat: schema.encodingFormat,
      mimeType: schema.encodingFormat,
      contentSize: schema.contentSize,
      size: schema.contentSize,
      url: `/attachments/${schema.identifier}`,
      uploadedAt: schema.dateCreated,
      uploadedBy: schema.author?.name || 'Unknown',
      filePath: schema.storageLocation,
      description: schema.description
    })));
  }

  /**
   * Find an attachment by its original filename across all attachments
   * @param filename - Original filename to search for
   * @returns Matching attachment metadata or null
   */
  async getAttachmentByFilename(filename: string): Promise<AttachmentMetadata | null> {
    for (const schema of this.attachmentMetadata.values()) {
      if (schema.name === filename) {
        return {
          identifier: schema.identifier,
          id: schema.identifier,
          name: schema.name,
          filename: schema.name,
          pageUuid: schema.mentions[0]?.name || '',
          encodingFormat: schema.encodingFormat,
          mimeType: schema.encodingFormat,
          contentSize: schema.contentSize,
          size: schema.contentSize,
          url: `/attachments/${schema.identifier}`,
          uploadedAt: schema.dateCreated,
          uploadedBy: schema.author?.name || 'Unknown',
          filePath: schema.storageLocation,
          description: schema.description
        };
      }
    }
    return null;
  }

  /**
   * List attachments for a page (AttachmentProvider interface method)
   * @param pageUuid - Page UUID
   * @returns Array of attachment metadata
   */
  async listAttachments(pageUuid: string): Promise<AttachmentMetadata[]> {
    return this.getAttachmentsForPage(pageUuid);
  }

  /**
   * Delete all attachments for a page
   * @param pageUuid - Page UUID
   * @returns Number of attachments deleted
   */
  async deletePageAttachments(pageUuid: string): Promise<number> {
    const attachments = await this.getAttachmentsForPage(pageUuid);
    let deleted = 0;

    for (const attachment of attachments) {
      const success = await this.deleteAttachment(attachment.id);
      if (success) {
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Refresh attachment list (rescan storage)
   * @returns Promise that resolves when complete
   */
  async refreshAttachmentList(): Promise<void> {
    await this.loadMetadata();
    logger.info('[BasicAttachmentProvider] Refreshed attachment list');
  }

  /**
   * Get provider information
   * @returns Provider metadata
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'BasicAttachmentProvider',
      version: '1.0.0',
      description: 'Filesystem storage with Schema.org metadata',
      features: [
        'content-deduplication',
        'schema-org-metadata',
        'shared-storage',
        'page-mentions-tracking',
        'mime-type-filtering',
        'size-limits'
      ]
    };
  }

  /**
   * Backup provider data
   * @returns Backup data
   */
  backup(): Promise<BackupData> {
    if (!this.metadataFile || !this.storageDirectory) {
      return Promise.reject(new Error('Provider not properly initialized'));
    }

    return Promise.resolve({
      providerName: 'BasicAttachmentProvider',
      timestamp: new Date().toISOString(),
      metadataFile: this.metadataFile,
      storageDirectory: this.storageDirectory,
      attachments: Array.from(this.attachmentMetadata.entries())
    });
  }

  /**
   * Restore provider data from backup
   * @param backupData - Backup data
   * @returns Promise that resolves when complete
   */
  async restore(backupData: Record<string, unknown>): Promise<void> {
    if (!backupData || !backupData.attachments) {
      throw new Error('Invalid backup data for BasicAttachmentProvider');
    }

    const typedBackupData = backupData as BackupData;

    logger.info(`[BasicAttachmentProvider] Restoring ${typedBackupData.attachments.length} attachments from backup`);

    // Restore metadata Map
    this.attachmentMetadata.clear();
    for (const [id, metadata] of typedBackupData.attachments) {
      this.attachmentMetadata.set(id, metadata);
    }

    // Save to file
    await this.saveMetadata();

    logger.info('[BasicAttachmentProvider] Restore completed successfully');
  }

  // -------------------------------------------------------------------------
  // AssetProvider interface (Epic #405 Phase 1)
  // -------------------------------------------------------------------------

  readonly id = 'local';
  readonly displayName = 'Local Attachments';
  readonly capabilities: import('../types/Asset.js').ProviderCapability[] = ['upload', 'search', 'stream', 'thumbnail'];

  /**
   * AssetProvider.getThumbnail() — generate (and cache) a JPEG thumbnail for image attachments.
   * Returns null for non-image attachments or when the source file cannot be processed.
   */
  async getThumbnail(id: string, size: string): Promise<Buffer | null> {
    const schema = this.attachmentMetadata.get(id);
    if (!schema || !schema.encodingFormat.startsWith('image/')) return null;
    if (!this.thumbDir) return null;

    const dims = parseSize(size);
    if (!dims) return null;

    const thumbPath = path.join(this.thumbDir, `${id}-${size}.jpg`);

    if (await fs.pathExists(thumbPath)) {
      return fs.readFile(thumbPath);
    }

    try {
      const buffer = await transformImage(schema.storageLocation, {
        width: dims.width,
        height: dims.height,
        fit: 'inside',
        format: 'jpeg',
        quality: 85
      });
      await fs.ensureDir(this.thumbDir);
      await fs.writeFile(thumbPath, buffer);
      return buffer;
    } catch (err) {
      logger.warn(`[BasicAttachmentProvider] Thumbnail generation failed for ${id}: ${String(err)}`);
      return null;
    }
  }

  /**
   * Extract embedded document metadata via ExifTool (Slice 5 of #755 / #759).
   *
   * Handles PDFs and Office Open XML (`.docx`, `.xlsx`, `.pptx`). Returns the
   * subset of fields we map into `SchemaCreativeWork` per the schemas.md
   * `DigitalDocument` per-source mapping. Returns null for non-document MIME
   * types or when extraction fails (treated as non-fatal — uploads always
   * succeed even if metadata extraction trips).
   */
  private async extractDocMetadata(filePath: string, mimeType: string): Promise<{
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
    dateCreated?: string;
    dateModified?: string;
    inLanguage?: string;
  } | null> {
    if (!BasicAttachmentProvider.DOC_METADATA_MIME_TYPES.has(mimeType)) return null;

    try {
      // exiftool-vendored's `Tags` type is strict and doesn't declare PDF/docx
      // fields like ModDate, Language, Subject. Double-cast through `unknown`
      // to a loose bag so we can read them — single-step casts get stripped by
      // `@typescript-eslint/no-unnecessary-type-assertion` on commit.
      const rawTags = await this.exiftool().read(filePath);
      const tags = rawTags as unknown as Record<string, unknown>;

      const title = typeof tags.Title === 'string' && tags.Title ? tags.Title : undefined;
      // Author — try both PDF (Author) and OOXML (Creator).
      const rawAuthor = tags.Author ?? tags.Creator;
      const author: string | undefined = Array.isArray(rawAuthor)
        ? (typeof rawAuthor[0] === 'string' ? rawAuthor[0] : undefined)
        : (typeof rawAuthor === 'string' && rawAuthor ? rawAuthor : undefined);
      const subject = typeof tags.Subject === 'string' && tags.Subject ? tags.Subject : undefined;

      // Keywords: PDF emits a comma- or semicolon-delimited string; docx emits
      // an array. Normalise to deduped string[].
      const rawKeywords = tags.Keywords;
      let keywords: string[] | undefined;
      if (Array.isArray(rawKeywords)) {
        keywords = (rawKeywords as unknown[]).filter((k): k is string => typeof k === 'string' && k.length > 0);
      } else if (typeof rawKeywords === 'string' && rawKeywords) {
        keywords = rawKeywords.split(/[,;]\s*/).map(k => k.trim()).filter(Boolean);
      }
      if (keywords && keywords.length > 0) {
        keywords = [...new Set(keywords)];
      } else {
        keywords = undefined;
      }

      // Dates: exiftool-vendored returns ExifDateTime-shaped objects with .year, .month, etc.
      const dateCreated = this.formatExifDate(tags.CreationDate ?? tags.CreateDate);
      const dateModified = this.formatExifDate(tags.ModifyDate ?? tags.ModDate);

      const inLanguage = typeof tags.Language === 'string' && tags.Language ? tags.Language : undefined;

      // Treat all-undefined as "no useful metadata" — return null so the caller
      // can leave the new fields off the SchemaCreativeWork entirely.
      if (!title && !author && !subject && !keywords && !dateCreated && !dateModified && !inLanguage) {
        return null;
      }

      return { title, author, subject, keywords, dateCreated, dateModified, inLanguage };
    } catch (err) {
      logger.warn(`[BasicAttachmentProvider] extractDocMetadata failed for ${filePath}: ${String(err)}`);
      return null;
    }
  }

  /**
   * Format an exiftool-vendored date value to ISO-ish "YYYY-MM-DD HH:MM:SS".
   * Accepts the `ExifDateTime` shape (object with year/month/etc.) or a string
   * passthrough. Returns undefined for anything unparseable.
   */
  private formatExifDate(raw: unknown): string | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw === 'string' && raw) return raw;
    if (typeof raw === 'object' && raw !== null) {
      const dt = raw as { year?: number; month?: number; day?: number; hour?: number; minute?: number; second?: number };
      if (typeof dt.year === 'number') {
        const pad = (n: number): string => String(n).padStart(2, '0');
        return `${dt.year}-${pad(dt.month ?? 1)}-${pad(dt.day ?? 1)} ${pad(dt.hour ?? 0)}:${pad(dt.minute ?? 0)}:${pad(dt.second ?? 0)}`;
      }
    }
    return undefined;
  }

  /**
   * Convert a SchemaCreativeWork record to a schema.org-shaped CreativeWork
   * (Slice 5 of #755 / #759).
   *
   * For PDF / docx / xlsx / pptx attachments → `DigitalDocument` with embedded
   * doc-metadata fields populated. For everything else → a base CreativeWork
   * (no subtype specialisation) — image/video attachments that need full
   * ImageObject / VideoObject treatment are out-of-scope for this slice
   * (they go through the media path).
   *
   * Public so AttachmentManager (the registered `CatalogSource`) can call it
   * without exposing the internal SchemaCreativeWork shape.
   */
  toCreativeWork(schema: SchemaCreativeWork): CreativeWork {
    const isDoc = BasicAttachmentProvider.DOC_METADATA_MIME_TYPES.has(schema.encodingFormat);

    // Author preference: embedded doc author > uploader. Same for dateCreated.
    // Per schemas.md Decision 10, `author` is the immutable original creator;
    // for documents the embedded Author is the actual original.
    const authorVal: string | undefined = schema.documentAuthor
      ?? (schema.author ? schema.author.name : undefined);
    const dateCreatedVal: string | undefined = schema.documentDateCreated ?? schema.dateCreated;
    const dateModifiedVal: string | undefined = schema.documentDateModified ?? schema.dateModified;

    const baseFields = {
      '@id': `/attachments/${schema.identifier}`,
      identifier: schema.identifier,
      name: schema.documentTitle ?? schema.name,
      ...(schema.documentSubject || schema.description ? { description: schema.documentSubject ?? schema.description } : {}),
      ...(dateCreatedVal ? { dateCreated: dateCreatedVal } : {}),
      ...(dateModifiedVal ? { dateModified: dateModifiedVal } : {}),
      ...(authorVal ? { author: authorVal } : {}),
      ...(schema.documentKeywords && schema.documentKeywords.length > 0 ? { keywords: schema.documentKeywords } : {}),
      url: `/attachments/${schema.identifier}`,
      contentUrl: `/attachments/${schema.identifier}`,
      encodingFormat: schema.encodingFormat
    };

    if (isDoc) {
      const result: DigitalDocument = {
        ...baseFields,
        '@type': 'DigitalDocument',
        ...(schema.inLanguage ? { inLanguage: schema.inLanguage } : {})
      };
      return result;
    }

    // Non-document MIME — emit a base-shape Article-typed CreativeWork stub.
    // This is a deliberate fallback: until image/video attachments are routed
    // through their own subtype mapper (out-of-scope for Slice 5), they ride
    // the document subtype with empty-doc fields. Schemas.md treats this as
    // best-effort; consumers filter by `@type` upstream if they care.
    const result: DigitalDocument = {
      ...baseFields,
      '@type': 'DigitalDocument'
    };
    return result;
  }

  /** Convert a SchemaCreativeWork record to a unified AssetRecord. */
  private schemaToAssetRecord(schema: SchemaCreativeWork): AssetRecord {
    // Populate dimensions from sharp-extracted metadata stored at upload time
    const am = schema.assetMetadata ?? {};
    const w = typeof am['imageWidth'] === 'number' ? (am['imageWidth']) : undefined;
    const h = typeof am['imageHeight'] === 'number' ? (am['imageHeight']) : undefined;
    const dpi = typeof am['dpi'] === 'number' ? (am['dpi']) : undefined;
    const dimensions = w || h ? { width: w, height: h, dpi } : undefined;

    const metadata: AssetMetadata = { ...am };
    // Remove internal storage keys from the exposed metadata bag
    delete metadata['imageWidth'];
    delete metadata['imageHeight'];
    delete metadata['dpi'];

    return {
      id: schema.identifier,
      providerId: this.id,
      filename: schema.name,
      encodingFormat: schema.encodingFormat,
      contentSize: schema.contentSize,
      url: `/attachments/${schema.identifier}`,
      thumbnailUrl: schema.encodingFormat.startsWith('image/')
        ? `/attachments/thumb/${schema.identifier}?size=150x150`
        : undefined,
      dateCreated: schema.dateCreated,
      dateModified: schema.dateModified,
      author: schema.author?.name,
      description: schema.description,
      keywords: [],
      dimensions,
      mentions: (schema.mentions ?? []).map(m => m.name ?? '').filter(Boolean),
      isPrivate: schema.isPrivate,
      metadata,
      insertSnippet: schema.encodingFormat.startsWith('image/')
        ? `[{Image src='${schema.name}'}]`
        : `[{ATTACH src='${schema.name}'}]`
    };
  }

  /**
   * AssetProvider.search() — searches by filename and description.
   */
  search(query: AssetQuery): Promise<AssetPage> {
    const { query: q = '', pageSize = 48, offset = 0, mimeCategory } = query;
    const lower = q.toLowerCase();

    let items = Array.from(this.attachmentMetadata.values());

    if (lower) {
      items = items.filter(s => {
        // Filename and description (existing behaviour)
        if (s.name.toLowerCase().includes(lower)) return true;
        if ((s.description ?? '').toLowerCase().includes(lower)) return true;
        // Slice 5 of #755 (#759) — embedded document metadata makes attachments
        // findable beyond filename / uploader description.
        if ((s.documentTitle ?? '').toLowerCase().includes(lower)) return true;
        if ((s.documentAuthor ?? '').toLowerCase().includes(lower)) return true;
        if ((s.documentSubject ?? '').toLowerCase().includes(lower)) return true;
        if (s.documentKeywords?.some(k => k.toLowerCase().includes(lower))) return true;
        return false;
      });
    }

    if (mimeCategory) {
      items = items.filter(s => {
        const f = s.encodingFormat;
        const isImage = f.startsWith('image/');
        const isVideo = f.startsWith('video/');
        const isAudio = f.startsWith('audio/');
        // #720: "PDF & Office" — pdf + text + Word/Excel/PowerPoint/ODF.
        const isDoc = f.includes('pdf') || f.startsWith('text/') ||
                      f.startsWith('application/msword') || f.startsWith('application/vnd.');
        if (mimeCategory === 'image') return isImage;
        if (mimeCategory === 'video') return isVideo;
        if (mimeCategory === 'audio') return isAudio;
        if (mimeCategory === 'document') return isDoc;
        return !isImage && !isVideo && !isAudio && !isDoc; // 'other'
      });
    }

    // Sort by dateCreated desc by default
    items = items.sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime());

    const total = items.length;
    const page = items.slice(offset, offset + pageSize).map(s => this.schemaToAssetRecord(s));
    return Promise.resolve({ results: page, total, hasMore: offset + page.length < total });
  }

  /**
   * AssetProvider.getById() — returns AssetRecord for the given attachment ID.
   */
  getById(id: string): Promise<AssetRecord | null> {
    const schema = this.attachmentMetadata.get(id);
    return Promise.resolve(schema ? this.schemaToAssetRecord(schema) : null);
  }

  /**
   * AssetProvider.store() — delegates to storeAttachment().
   * For images, extracts basic metadata via sharp (dimensions, color space,
   * orientation, DPI) and persists it on the schema entry. Phase 5 #405.
   */
  async store(buffer: Buffer, info: AssetInput): Promise<AssetRecord> {
    const fileInfo: FileInfo = {
      originalName: info.originalName,
      mimeType: info.mimeType,
      size: info.size
    };
    const user: User = info.uploadedBy ? { username: info.uploadedBy } : {};
    const partialMeta: Partial<AttachmentMetadata> = {};
    if (info.pageName) {
      partialMeta['mentions'] = [{ '@type': 'Thing', name: info.pageName, url: `/view/${info.pageName}` }];
    }
    if (info.description) partialMeta['description'] = info.description;

    // Extract image metadata via sharp (non-critical — failures never block upload)
    if (info.mimeType.startsWith('image/')) {
      try {
        const sm = await sharp(buffer).metadata();
        const assetMeta: AssetMetadata = {};
        if (sm.orientation) assetMeta.orientation = sm.orientation;
        if (sm.space) assetMeta.colorSpace = sm.space;
        if (sm.width || sm.height) {
          assetMeta['imageWidth'] = sm.width;
          assetMeta['imageHeight'] = sm.height;
        }
        if (sm.density) assetMeta['dpi'] = sm.density;
        if (Object.keys(assetMeta).length > 0) {
          (partialMeta as Record<string, unknown>)['assetMetadata'] = assetMeta;
        }
      } catch {
        // Non-critical — proceed without extracted metadata
      }
    }

    const meta = await this.storeAttachment(buffer, fileInfo, partialMeta, user);
    const id = meta.id ?? (meta as Record<string, unknown>)['identifier'] as string;
    const schema = this.attachmentMetadata.get(id);
    if (!schema) throw new Error(`[BasicAttachmentProvider] Failed to locate stored attachment ${id}`);
    return this.schemaToAssetRecord(schema);
  }

  /**
   * AssetProvider.delete() — delegates to deleteAttachment().
   */
  async delete(id: string): Promise<boolean> {
    return this.deleteAttachment(id);
  }

  /**
   * AssetProvider.stream() — opens a read stream for the attachment file.
   */
  async stream(id: string): Promise<NodeJS.ReadableStream | null> {
    const schema = this.attachmentMetadata.get(id);
    if (!schema) return null;
    const filePath = schema.storageLocation;
    if (!filePath || !(await fs.pathExists(filePath))) return null;
    return fs.createReadStream(filePath);
  }
}

export default BasicAttachmentProvider;

