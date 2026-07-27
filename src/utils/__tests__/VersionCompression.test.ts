import VersionCompression from '../VersionCompression';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('VersionCompression', () => {
  let testDir;

  beforeEach(async () => {
    // Create a temporary directory for test files
    testDir = path.join(os.tmpdir(), `version-compression-test-${Date.now()}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    if (await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  describe('compress', () => {
    test('should compress string content', () => {
      const content = 'Hello world'.repeat(100);
      const compressed = VersionCompression.compress(content);

      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeLessThan(Buffer.byteLength(content));
    });

    test('should compress Buffer content', () => {
      const content = Buffer.from('Hello world'.repeat(100), 'utf8');
      const compressed = VersionCompression.compress(content);

      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeLessThan(content.length);
    });

    test('should handle empty string', () => {
      const compressed = VersionCompression.compress('');

      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeGreaterThan(0); // gzip header is ~20 bytes
    });

    test('should accept compression level option', () => {
      const content = 'Test content'.repeat(100);

      const level1 = VersionCompression.compress(content, { level: 1 });
      const level9 = VersionCompression.compress(content, { level: 9 });

      // Higher compression level should produce smaller output
      expect(level9.length).toBeLessThanOrEqual(level1.length);
    });

    test('should throw TypeError for invalid content type', () => {
      expect(() => VersionCompression.compress(null)).toThrow(TypeError);
      expect(() => VersionCompression.compress(123)).toThrow(TypeError);
      expect(() => VersionCompression.compress({})).toThrow(TypeError);
    });

    test('should throw RangeError for invalid compression level', () => {
      expect(() => VersionCompression.compress('test', { level: 0 })).toThrow(RangeError);
      expect(() => VersionCompression.compress('test', { level: 10 })).toThrow(RangeError);
      expect(() => VersionCompression.compress('test', { level: -1 })).toThrow(RangeError);
    });
  });

  describe('decompress', () => {
    test('should decompress to original content', () => {
      const original = 'Hello world test content';
      const compressed = VersionCompression.compress(original);
      const decompressed = VersionCompression.decompress(compressed);

      expect(decompressed).toBe(original);
    });

    test('should handle large content', () => {
      const original = 'Large content '.repeat(10000);
      const compressed = VersionCompression.compress(original);
      const decompressed = VersionCompression.decompress(compressed);

      expect(decompressed).toBe(original);
    });

    test('should handle unicode characters', () => {
      const original = 'Hello 世界 🌍';
      const compressed = VersionCompression.compress(original);
      const decompressed = VersionCompression.decompress(compressed);

      expect(decompressed).toBe(original);
    });

    test('should handle multiline content', () => {
      const original = 'Line 1\nLine 2\nLine 3\n';
      const compressed = VersionCompression.compress(original);
      const decompressed = VersionCompression.decompress(compressed);

      expect(decompressed).toBe(original);
    });

    test('should throw TypeError for non-Buffer input', () => {
      expect(() => VersionCompression.decompress('not a buffer')).toThrow(TypeError);
      expect(() => VersionCompression.decompress(null)).toThrow(TypeError);
      expect(() => VersionCompression.decompress(123)).toThrow(TypeError);
    });

    test('should throw Error for corrupted data', () => {
      const corruptedData = Buffer.from('invalid gzip data');

      expect(() => VersionCompression.decompress(corruptedData)).toThrow(Error);
      expect(() => VersionCompression.decompress(corruptedData)).toThrow(/Decompression failed/);
    });
  });

  describe('compress and decompress roundtrip', () => {
    test('should preserve content through roundtrip', () => {
      const testCases = [
        'Simple text',
        'Text with\nnewlines\nand\ntabs\t\there',
        'Unicode: 你好世界 🌍 ñoño',
        'Empty string: ""',
        'Numbers: 123456789',
        'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?/',
        'A'.repeat(10000) // Large content
      ];

      for (const original of testCases) {
        const compressed = VersionCompression.compress(original);
        const decompressed = VersionCompression.decompress(compressed);
        expect(decompressed).toBe(original);
      }
    });
  });

  describe('compressFile', () => {
    test('should compress a file', async () => {
      const filePath = path.join(testDir, 'test.txt');
      const content = 'Test content '.repeat(100);
      await fs.writeFile(filePath, content, 'utf8');

      const result = await VersionCompression.compressFile(filePath);

      expect(result.originalSize).toBe(Buffer.byteLength(content, 'utf8'));
      expect(result.compressedSize).toBeLessThan(result.originalSize);
      expect(result.ratio).toBeGreaterThan(0);
      expect(result.compressedPath).toBe(`${filePath}.gz`);

      // Original file should be removed
      expect(await fs.pathExists(filePath)).toBe(false);
      // Compressed file should exist
      expect(await fs.pathExists(`${filePath}.gz`)).toBe(true);
    });

    test('should keep original when keepOriginal is true', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'Test content', 'utf8');

      await VersionCompression.compressFile(filePath, { keepOriginal: true });

      // Both files should exist
      expect(await fs.pathExists(filePath)).toBe(true);
      expect(await fs.pathExists(`${filePath}.gz`)).toBe(true);
    });

    test('should respect compression level', async () => {
      const filePath1 = path.join(testDir, 'test1.txt');
      const filePath2 = path.join(testDir, 'test2.txt');
      const content = 'Repetitive content '.repeat(1000);

      await fs.writeFile(filePath1, content, 'utf8');
      await fs.writeFile(filePath2, content, 'utf8');

      const result1 = await VersionCompression.compressFile(filePath1, { level: 1 });
      const result2 = await VersionCompression.compressFile(filePath2, { level: 9 });

      // Higher compression level should produce smaller file
      expect(result2.compressedSize).toBeLessThanOrEqual(result1.compressedSize);
      expect(result2.ratio).toBeGreaterThanOrEqual(result1.ratio);
    });

    test('should throw Error for non-existent file', async () => {
      const filePath = path.join(testDir, 'nonexistent.txt');

      await expect(VersionCompression.compressFile(filePath)).rejects.toThrow(/File not found/);
    });
  });

  describe('decompressFile', () => {
    test('should decompress a file', async () => {
      const originalPath = path.join(testDir, 'test.txt');
      const content = 'Test content for decompression';

      // Create and compress file
      await fs.writeFile(originalPath, content, 'utf8');
      await VersionCompression.compressFile(originalPath);

      // Decompress
      const compressedPath = `${originalPath}.gz`;
      const result = await VersionCompression.decompressFile(compressedPath);

      expect(result.decompressedSize).toBe(Buffer.byteLength(content, 'utf8'));
      expect(result.decompressedPath).toBe(originalPath);

      // Compressed file should be removed
      expect(await fs.pathExists(compressedPath)).toBe(false);
      // Decompressed file should exist
      expect(await fs.pathExists(originalPath)).toBe(true);

      // Content should match original
      const decompressedContent = await fs.readFile(originalPath, 'utf8');
      expect(decompressedContent).toBe(content);
    });

    test('should keep compressed when keepCompressed is true', async () => {
      const originalPath = path.join(testDir, 'test.txt');
      await fs.writeFile(originalPath, 'Test', 'utf8');
      await VersionCompression.compressFile(originalPath);

      const compressedPath = `${originalPath}.gz`;
      await VersionCompression.decompressFile(compressedPath, { keepCompressed: true });

      // Both files should exist
      expect(await fs.pathExists(originalPath)).toBe(true);
      expect(await fs.pathExists(compressedPath)).toBe(true);
    });

    test('should throw Error for non-existent file', async () => {
      const filePath = path.join(testDir, 'nonexistent.txt.gz');

      await expect(VersionCompression.decompressFile(filePath)).rejects.toThrow(/File not found/);
    });

    test('should throw Error for non-.gz file', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'test', 'utf8');

      await expect(VersionCompression.decompressFile(filePath)).rejects.toThrow(/must have \.gz extension/);
    });
  });

  describe('file roundtrip', () => {
    test('should preserve file content through compress/decompress cycle', async () => {
      const filePath = path.join(testDir, 'roundtrip.txt');
      // Use larger content to ensure compression (gzip has ~20 byte overhead)
      const originalContent = 'Content to test roundtrip\nWith multiple lines\nAnd unicode 你好\n'.repeat(50);

      await fs.writeFile(filePath, originalContent, 'utf8');

      // Compress
      const compressResult = await VersionCompression.compressFile(filePath);
      // With larger content, compression should work
      expect(compressResult.compressedSize).toBeLessThan(compressResult.originalSize);

      // Decompress
      await VersionCompression.decompressFile(compressResult.compressedPath);

      // Verify content
      const finalContent = await fs.readFile(filePath, 'utf8');
      expect(finalContent).toBe(originalContent);
    });
  });

  describe('isCompressed', () => {
    test('should return true for compressed file', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'Test content', 'utf8');
      await VersionCompression.compressFile(filePath);

      const isCompressed = await VersionCompression.isCompressed(`${filePath}.gz`);
      expect(isCompressed).toBe(true);
    });

    test('should return false for non-compressed file', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'Test content', 'utf8');

      const isCompressed = await VersionCompression.isCompressed(filePath);
      expect(isCompressed).toBe(false);
    });

    test('should return false for file with .gz extension but invalid content', async () => {
      const filePath = path.join(testDir, 'fake.txt.gz');
      await fs.writeFile(filePath, 'Not actually compressed', 'utf8');

      const isCompressed = await VersionCompression.isCompressed(filePath);
      expect(isCompressed).toBe(false);
    });

    test('should return false for non-existent file', async () => {
      const filePath = path.join(testDir, 'nonexistent.txt.gz');

      const isCompressed = await VersionCompression.isCompressed(filePath);
      expect(isCompressed).toBe(false);
    });
  });

  describe('calculateRatio', () => {
    test('should calculate compression ratio correctly', () => {
      expect(VersionCompression.calculateRatio(1000, 500)).toBe(50);
      expect(VersionCompression.calculateRatio(1000, 750)).toBe(25);
      expect(VersionCompression.calculateRatio(1000, 100)).toBe(90);
      expect(VersionCompression.calculateRatio(100, 100)).toBe(0);
    });

    test('should handle zero original size', () => {
      expect(VersionCompression.calculateRatio(0, 0)).toBe(0);
    });

    test('should handle negative compression (expansion)', () => {
      // Sometimes very small files compress larger due to gzip overhead
      const ratio = VersionCompression.calculateRatio(10, 30);
      expect(ratio).toBeLessThan(0);
    });

    test('should throw TypeError for non-number inputs', () => {
      expect(() => VersionCompression.calculateRatio('100', 50)).toThrow(TypeError);
      expect(() => VersionCompression.calculateRatio(100, '50')).toThrow(TypeError);
      expect(() => VersionCompression.calculateRatio(null, 50)).toThrow(TypeError);
    });
  });

  describe('getCompressedStats', () => {
    test('should return stats for compressed file', async () => {
      const filePath = path.join(testDir, 'stats-test.txt');
      const content = 'Content for stats test '.repeat(100);

      await fs.writeFile(filePath, content, 'utf8');
      const compressResult = await VersionCompression.compressFile(filePath);

      const stats = await VersionCompression.getCompressedStats(compressResult.compressedPath);

      expect(stats.path).toBe(compressResult.compressedPath);
      expect(stats.compressedSize).toBe(compressResult.compressedSize);
      expect(stats.originalSize).toBe(compressResult.originalSize);
      expect(stats.ratio).toBeCloseTo(compressResult.ratio, 1);
      expect(stats.modified).toBeTruthy();
      expect(typeof stats.modified.getTime).toBe('function'); // Has getTime method like a Date
    });

    test('should throw Error for non-existent file', async () => {
      const filePath = path.join(testDir, 'nonexistent.txt.gz');

      await expect(VersionCompression.getCompressedStats(filePath)).rejects.toThrow(/File not found/);
    });
  });

  describe('Integration tests', () => {
    test('should handle realistic wiki version scenario', async () => {
      const v1Path = path.join(testDir, 'page-v1.md');
      const v1Content = `# Welcome Page

This is version 1 of our wiki page with lots of content.

## Section 1
${('Content paragraph. '.repeat(50))}

## Section 2
${('More content here. '.repeat(50))}`;

      // Write v1
      await fs.writeFile(v1Path, v1Content, 'utf8');
      const originalSize = Buffer.byteLength(v1Content, 'utf8');

      // Compress v1
      const result = await VersionCompression.compressFile(v1Path);

      expect(result.ratio).toBeGreaterThan(50); // Expect >50% compression for repetitive text
      expect(result.compressedSize).toBeLessThan(originalSize / 2);

      // Decompress and verify
      await VersionCompression.decompressFile(result.compressedPath);
      const decompressed = await fs.readFile(v1Path, 'utf8');

      expect(decompressed).toBe(v1Content);
    });

    test('should handle multiple versions with different compression levels', async () => {
      const versions = [
        { name: 'v1.md', level: 1 },
        { name: 'v2.md', level: 6 },
        { name: 'v3.md', level: 9 }
      ];

      const content = 'Wiki page content '.repeat(1000);
      const results = [];

      for (const { name, level } of versions) {
        const filePath = path.join(testDir, name);
        await fs.writeFile(filePath, content, 'utf8');
        const result = await VersionCompression.compressFile(filePath, { level });
        results.push(result);
      }

      // Verify compression ratios increase with level
      expect(results[2].ratio).toBeGreaterThanOrEqual(results[1].ratio);
      expect(results[1].ratio).toBeGreaterThanOrEqual(results[0].ratio);
    });
  });
});
