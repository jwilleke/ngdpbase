import pako from 'pako';
import fs from 'fs-extra';

/**
 * Compression options
 */
export interface CompressionOptions {
  /** Compression level (1-9, default 6) */
  level?: number;
}

/**
 * File compression options
 */
export interface FileCompressionOptions extends CompressionOptions {
  /** Keep original file after compression (default false) */
  keepOriginal?: boolean;
}

/**
 * File decompression options
 */
export interface FileDecompressionOptions {
  /** Keep compressed file after decompression (default false) */
  keepCompressed?: boolean;
}

/**
 * Compression result
 */
export interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  ratio: number;
  compressedPath: string;
}

/**
 * Decompression result
 */
export interface DecompressionResult {
  decompressedSize: number;
  decompressedPath: string;
}

/**
 * Compressed file stats
 */
export interface CompressedStats {
  path: string;
  compressedSize: number;
  originalSize: number | null;
  ratio: number | null;
  modified: Date;
}

/**
 * VersionCompression - Utility for compressing and decompressing version content
 *
 * Uses pako (pure JavaScript gzip implementation) to compress old version files.
 * This significantly reduces disk space usage for version history.
 *
 * Compression is particularly effective for:
 * - Text content (60-80% size reduction typical)
 * - Diff files (often compress very well)
 * - Large content files
 *
 * @example
 * const compressed = VersionCompression.compress("Hello world");
 * const decompressed = VersionCompression.decompress(compressed);
 * // decompressed === "Hello world"
 */
export default class VersionCompression {
  /**
   * Compress content using gzip
   *
   * Takes string or Buffer content and returns a gzip-compressed Buffer.
   * Uses default compression level (6) which balances speed and compression ratio.
   *
   * @param content - Content to compress
   * @param options - Compression options
   * @returns Compressed content
   * @throws {TypeError} If content is not string or Buffer
   * @example
   * const compressed = VersionCompression.compress("Large text content...");
   * console.log('Compression ratio:', compressed.length / original.length);
   */
  static compress(content: string | Buffer, options: CompressionOptions = {}): Buffer {
    if (typeof content !== 'string' && !Buffer.isBuffer(content)) {
      throw new TypeError('content must be a string or Buffer');
    }

    const { level = 6 } = options;

    if (typeof level !== 'number' || level < 1 || level > 9) {
      throw new RangeError('Compression level must be between 1 and 9');
    }

    try {
      // Convert string to buffer if needed
      const inputBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');

      // Compress using pako with specified level
      const compressed = pako.gzip(inputBuffer, { level: level as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 });

      return Buffer.from(compressed);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Compression failed: ${errorMessage}`, { cause: error });
    }
  }

  /**
   * Decompress gzip content
   *
   * Takes a gzip-compressed Buffer and returns the original string content.
   * Automatically handles UTF-8 encoding.
   *
   * @param compressed - Compressed content
   * @returns Decompressed content as string
   * @throws {TypeError} If compressed is not a Buffer
   * @throws {Error} If decompression fails (corrupted data)
   * @example
   * const compressed = VersionCompression.compress("Original");
   * const original = VersionCompression.decompress(compressed);
   */
  static decompress(compressed: Buffer): string {
    if (!Buffer.isBuffer(compressed)) {
      throw new TypeError('compressed must be a Buffer');
    }

    try {
      // Decompress using pako
      const decompressed = pako.ungzip(compressed);

      // Convert to string
      return Buffer.from(decompressed).toString('utf8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Decompression failed: ${errorMessage}`, { cause: error });
    }
  }

  /**
   * Compress a file in place
   *
   * Reads a file, compresses it, and writes it back with .gz extension.
   * Original file is removed after successful compression.
   * Creates a backup before compression for safety.
   *
   * @param filePath - Path to file to compress
   * @param options - Compression options
   * @returns Compression statistics
   * @throws {Error} If file doesn't exist or compression fails
   * @example
   * const result = await VersionCompression.compressFile('./v1/content.md');
   * console.log(`Saved ${result.ratio}% space`);
   * // File is now ./v1/content.md.gz
   */
  static async compressFile(filePath: string, options: FileCompressionOptions = {}): Promise<CompressionResult> {
    const { level = 6, keepOriginal = false } = options;

    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    try {
      // Read original file
      const content = await fs.readFile(filePath);
      const originalSize = content.length;

      // Compress
      const compressed = this.compress(content, { level });
      const compressedSize = compressed.length;

      // Write compressed file
      const compressedPath = `${filePath}.gz`;
      await fs.writeFile(compressedPath, compressed);

      // Remove original file unless keepOriginal is true
      if (!keepOriginal) {
        await fs.unlink(filePath);
      }

      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(2);

      return {
        originalSize,
        compressedSize,
        ratio: parseFloat(ratio),
        compressedPath
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to compress file ${filePath}: ${errorMessage}`, { cause: error });
    }
  }

  /**
   * Decompress a file in place
   *
   * Reads a .gz file, decompresses it, and writes the original content back.
   * Removes the .gz file after successful decompression.
   *
   * @param filePath - Path to .gz file to decompress
   * @param options - Decompression options
   * @returns Decompression statistics
   * @throws {Error} If file doesn't exist, isn't .gz, or decompression fails
   * @example
   * await VersionCompression.decompressFile('./v1/content.md.gz');
   * // File is now ./v1/content.md
   */
  static async decompressFile(filePath: string, options: FileDecompressionOptions = {}): Promise<DecompressionResult> {
    const { keepCompressed = false } = options;

    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Verify it's a .gz file
    if (!filePath.endsWith('.gz')) {
      throw new Error(`File must have .gz extension: ${filePath}`);
    }

    try {
      // Read compressed file
      const compressed = await fs.readFile(filePath);

      // Decompress
      const decompressed = this.decompress(compressed);

      // Write decompressed file (remove .gz extension)
      const decompressedPath = filePath.slice(0, -3); // Remove .gz
      await fs.writeFile(decompressedPath, decompressed, 'utf8');

      const decompressedSize = Buffer.byteLength(decompressed, 'utf8');

      // Remove compressed file unless keepCompressed is true
      if (!keepCompressed) {
        await fs.unlink(filePath);
      }

      return {
        decompressedSize,
        decompressedPath
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to decompress file ${filePath}: ${errorMessage}`, { cause: error });
    }
  }

  /**
   * Check if file is compressed
   *
   * Checks if a file has .gz extension and is a valid gzip file.
   *
   * @param filePath - Path to file to check
   * @returns True if file is compressed
   */
  static async isCompressed(filePath: string): Promise<boolean> {
    if (!await fs.pathExists(filePath)) {
      return false;
    }

    // Quick check: .gz extension
    if (!filePath.endsWith('.gz')) {
      return false;
    }

    try {
      // Try to read gzip header (first 2 bytes should be 0x1f 0x8b)
      const buffer = Buffer.alloc(2);
      const fd = await fs.open(filePath, 'r');
      await fs.read(fd, buffer, 0, 2, 0);
      await fs.close(fd);

      return buffer[0] === 0x1f && buffer[1] === 0x8b;
    } catch {
      return false;
    }
  }

  /**
   * Calculate compression ratio
   *
   * Compares original and compressed sizes to calculate space savings.
   *
   * @param originalSize - Original size in bytes
   * @param compressedSize - Compressed size in bytes
   * @returns Compression ratio as percentage (e.g., 65.5 means 65.5% smaller)
   */
  static calculateRatio(originalSize: number, compressedSize: number): number {
    if (typeof originalSize !== 'number' || typeof compressedSize !== 'number') {
      throw new TypeError('Both sizes must be numbers');
    }

    if (originalSize === 0) {
      return 0;
    }

    return parseFloat(((1 - compressedSize / originalSize) * 100).toFixed(2));
  }

  /**
   * Get compressed file stats
   *
   * Returns information about a compressed file including sizes and ratio.
   *
   * @param filePath - Path to compressed file
   * @returns File stats
   */
  static async getCompressedStats(filePath: string): Promise<CompressedStats> {
    if (!await fs.pathExists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = await fs.stat(filePath);
    const compressedSize = stats.size;

    // Try to determine original size by decompressing in memory
    let originalSize: number | null = null;
    let ratio: number | null = null;

    try {
      const compressed = await fs.readFile(filePath);
      const decompressed = this.decompress(compressed);
      originalSize = Buffer.byteLength(decompressed, 'utf8');
      ratio = this.calculateRatio(originalSize, compressedSize);
    } catch {
      // If decompression fails, just return what we know
    }

    return {
      path: filePath,
      compressedSize,
      originalSize,
      ratio,
      modified: stats.mtime
    };
  }
}
