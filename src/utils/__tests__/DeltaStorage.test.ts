import DeltaStorage from '../DeltaStorage';

describe('DeltaStorage', () => {
  describe('createDiff', () => {
    test('should create diff from identical content', () => {
      const diff = DeltaStorage.createDiff('Hello world', 'Hello world');
      expect(diff).toEqual([[0, 'Hello world']]);
    });

    test('should create diff from completely different content', () => {
      const diff = DeltaStorage.createDiff('foo', 'bar');
      expect(diff).toEqual([[-1, 'foo'], [1, 'bar']]);
    });

    test('should create diff with partial changes', () => {
      const old = 'Hello world';
      const new_ = 'Hello ngdpbase';
      const diff = DeltaStorage.createDiff(old, new_);

      // fast-diff optimizes by finding common characters
      // It keeps the common "d" between "world" and "ngdpbase"
      expect(diff).toContainEqual([0, 'Hello ']);
      expect(diff.some(op => op[0] === -1)).toBe(true); // Has deletions
      expect(diff.some(op => op[0] === 1)).toBe(true); // Has insertions

      // Verify roundtrip works
      const reconstructed = DeltaStorage.applyDiff(old, diff);
      expect(reconstructed).toBe(new_);
    });

    test('should handle empty strings', () => {
      const diff1 = DeltaStorage.createDiff('', '');
      expect(diff1).toEqual([]);

      const diff2 = DeltaStorage.createDiff('', 'new content');
      expect(diff2).toEqual([[1, 'new content']]);

      const diff3 = DeltaStorage.createDiff('old content', '');
      expect(diff3).toEqual([[-1, 'old content']]);
    });

    test('should handle unicode characters', () => {
      const old = 'Hello 世界';
      const new_ = 'Hello 🌍';
      const diff = DeltaStorage.createDiff(old, new_);

      expect(diff).toContainEqual([0, 'Hello ']);
      expect(diff).toContainEqual([-1, '世界']);
      expect(diff).toContainEqual([1, '🌍']);
    });

    test('should handle multiline content', () => {
      const old = 'Line 1\nLine 2\nLine 3';
      const new_ = 'Line 1\nModified Line 2\nLine 3';
      const diff = DeltaStorage.createDiff(old, new_);

      // Verify the diff includes the expected operations
      expect(diff).toContainEqual([0, 'Line 1\n']);
      expect(diff.some(op => op[0] === 1 && op[1].includes('Modified'))).toBe(true);

      // Most importantly, verify roundtrip works
      const reconstructed = DeltaStorage.applyDiff(old, diff);
      expect(reconstructed).toBe(new_);
    });

    test('should throw TypeError for non-string inputs', () => {
      expect(() => DeltaStorage.createDiff(null, 'foo')).toThrow(TypeError);
      expect(() => DeltaStorage.createDiff('foo', null)).toThrow(TypeError);
      expect(() => DeltaStorage.createDiff(123, 'foo')).toThrow(TypeError);
      expect(() => DeltaStorage.createDiff('foo', 456)).toThrow(TypeError);
    });
  });

  describe('applyDiff', () => {
    test('should apply diff to reconstruct content', () => {
      const base = 'Hello world';
      const diff = [[0, 'Hello '], [-1, 'world'], [1, 'ngdpbase']];
      const result = DeltaStorage.applyDiff(base, diff);

      expect(result).toBe('Hello ngdpbase');
    });

    test('should handle empty diff (no changes)', () => {
      const base = 'Hello world';
      const diff = [[0, 'Hello world']];
      const result = DeltaStorage.applyDiff(base, diff);

      expect(result).toBe('Hello world');
    });

    test('should handle full replacement', () => {
      const base = 'old content';
      const diff = [[-1, 'old content'], [1, 'new content']];
      const result = DeltaStorage.applyDiff(base, diff);

      expect(result).toBe('new content');
    });

    test('should handle insertions only', () => {
      const base = '';
      const diff = [[1, 'new content']];
      const result = DeltaStorage.applyDiff(base, diff);

      expect(result).toBe('new content');
    });

    test('should handle deletions only', () => {
      const base = 'content to delete';
      const diff = [[-1, 'content to delete']];
      const result = DeltaStorage.applyDiff(base, diff);

      expect(result).toBe('');
    });

    test('should handle complex diff', () => {
      const base = 'The quick brown fox jumps';
      const diff = [
        [0, 'The '],
        [-1, 'quick'],
        [1, 'slow'],
        [0, ' brown fox '],
        [-1, 'jumps'],
        [1, 'walks']
      ];
      const result = DeltaStorage.applyDiff(base, diff);

      expect(result).toBe('The slow brown fox walks');
    });

    test('should verify roundtrip (create + apply)', () => {
      const old = 'This is version 1 of the content';
      const new_ = 'This is version 2 of the content';

      const diff = DeltaStorage.createDiff(old, new_);
      const reconstructed = DeltaStorage.applyDiff(old, diff);

      expect(reconstructed).toBe(new_);
    });

    test('should throw TypeError for invalid inputs', () => {
      const validDiff = [[0, 'test']];

      expect(() => DeltaStorage.applyDiff(null, validDiff)).toThrow(TypeError);
      expect(() => DeltaStorage.applyDiff('base', null)).toThrow(TypeError);
      expect(() => DeltaStorage.applyDiff('base', 'not an array')).toThrow(TypeError);
    });

    test('should throw Error when diff does not match base', () => {
      const base = 'Hello world';
      const invalidDiff = [[0, 'Goodbye world']]; // Expects "Goodbye" but base has "Hello"

      expect(() => DeltaStorage.applyDiff(base, invalidDiff)).toThrow(Error);
      expect(() => DeltaStorage.applyDiff(base, invalidDiff)).toThrow(/expected.*but found/i);
    });

    test('should throw Error for invalid diff operation', () => {
      const base = 'test';
      const invalidDiff = [[99, 'test']]; // Invalid operation code

      expect(() => DeltaStorage.applyDiff(base, invalidDiff)).toThrow(/Invalid diff operation/);
    });
  });

  describe('applyDiffChain', () => {
    test('should apply multiple diffs sequentially', () => {
      const v1 = 'Version 1';
      const diffs = [
        [[0, 'Version '], [-1, '1'], [1, '2']], // v1 → v2
        [[0, 'Version '], [-1, '2'], [1, '3']], // v2 → v3
        [[0, 'Version '], [-1, '3'], [1, '4']]  // v3 → v4
      ];

      const v4 = DeltaStorage.applyDiffChain(v1, diffs);
      expect(v4).toBe('Version 4');
    });

    test('should handle empty diff array', () => {
      const v1 = 'Version 1';
      const result = DeltaStorage.applyDiffChain(v1, []);

      expect(result).toBe('Version 1');
    });

    test('should handle single diff', () => {
      const v1 = 'Version 1';
      const diffs = [[[0, 'Version '], [-1, '1'], [1, '2']]];

      const v2 = DeltaStorage.applyDiffChain(v1, diffs);
      expect(v2).toBe('Version 2');
    });

    test('should handle complex content evolution', () => {
      const v1 = 'Hello world';
      const diffs = [
        [[0, 'Hello '], [-1, 'world'], [1, 'ngdpbase']],                    // "Hello ngdpbase"
        [[0, 'Hello ngdpbase'], [1, ' version 2']],                         // "Hello ngdpbase version 2"
        [[0, 'Hello ngdpbase'], [-1, ' version 2'], [1, ' is awesome']]    // "Hello ngdpbase is awesome"
      ];

      const result = DeltaStorage.applyDiffChain(v1, diffs);
      expect(result).toBe('Hello ngdpbase is awesome');
    });

    test('should throw TypeError for invalid inputs', () => {
      expect(() => DeltaStorage.applyDiffChain(null, [])).toThrow(TypeError);
      expect(() => DeltaStorage.applyDiffChain('base', 'not array')).toThrow(TypeError);
    });

    test('should throw Error with context when diff fails', () => {
      const v1 = 'Version 1';
      const invalidDiffs = [
        [[0, 'Version '], [-1, '1'], [1, '2']], // Valid: v1 → v2
        [[0, 'Version '], [-1, '999'], [1, '3']] // Invalid: expects "999" but v2 has "2"
      ];

      expect(() => DeltaStorage.applyDiffChain(v1, invalidDiffs)).toThrow(Error);
      expect(() => DeltaStorage.applyDiffChain(v1, invalidDiffs)).toThrow(/Failed to apply diff 2/);
    });
  });

  describe('calculateHash', () => {
    test('should calculate SHA-256 hash', () => {
      const content = 'Hello world';
      const hash = DeltaStorage.calculateHash(content);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex characters
      expect(hash).toMatch(/^[0-9a-f]{64}$/); // Only lowercase hex
    });

    test('should produce consistent hashes', () => {
      const content = 'Test content';
      const hash1 = DeltaStorage.calculateHash(content);
      const hash2 = DeltaStorage.calculateHash(content);

      expect(hash1).toBe(hash2);
    });

    test('should produce different hashes for different content', () => {
      const hash1 = DeltaStorage.calculateHash('content 1');
      const hash2 = DeltaStorage.calculateHash('content 2');

      expect(hash1).not.toBe(hash2);
    });

    test('should handle empty string', () => {
      const hash = DeltaStorage.calculateHash('');

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    test('should handle unicode content', () => {
      const hash = DeltaStorage.calculateHash('Hello 世界 🌍');

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    test('should throw TypeError for non-string input', () => {
      expect(() => DeltaStorage.calculateHash(null)).toThrow(TypeError);
      expect(() => DeltaStorage.calculateHash(123)).toThrow(TypeError);
      expect(() => DeltaStorage.calculateHash({})).toThrow(TypeError);
    });
  });

  describe('verifyHash', () => {
    test('should verify matching hash', () => {
      const content = 'Test content';
      const hash = DeltaStorage.calculateHash(content);

      const isValid = DeltaStorage.verifyHash(content, hash);
      expect(isValid).toBe(true);
    });

    test('should reject non-matching hash', () => {
      const content = 'Test content';
      const wrongHash = DeltaStorage.calculateHash('Different content');

      const isValid = DeltaStorage.verifyHash(content, wrongHash);
      expect(isValid).toBe(false);
    });

    test('should reject invalid hash format', () => {
      const content = 'Test content';
      const invalidHash = 'not-a-valid-hash';

      const isValid = DeltaStorage.verifyHash(content, invalidHash);
      expect(isValid).toBe(false);
    });

    test('should throw TypeError for invalid inputs', () => {
      const validHash = DeltaStorage.calculateHash('test');

      expect(() => DeltaStorage.verifyHash(null, validHash)).toThrow(TypeError);
      expect(() => DeltaStorage.verifyHash('test', null)).toThrow(TypeError);
      expect(() => DeltaStorage.verifyHash(123, validHash)).toThrow(TypeError);
    });
  });

  describe('getDiffStats', () => {
    test('should calculate stats for diff with all operation types', () => {
      const diff = [
        [0, 'unchanged text'],     // 14 unchanged
        [-1, 'deleted'],           // 7 deletions
        [1, 'inserted']            // 8 additions
      ];

      const stats = DeltaStorage.getDiffStats(diff);

      expect(stats).toEqual({
        additions: 8,
        deletions: 7,
        unchanged: 14
      });
    });

    test('should handle diff with only unchanged content', () => {
      const diff = [[0, 'all unchanged']];
      const stats = DeltaStorage.getDiffStats(diff);

      expect(stats).toEqual({
        additions: 0,
        deletions: 0,
        unchanged: 13
      });
    });

    test('should handle diff with only additions', () => {
      const diff = [[1, 'new content']];
      const stats = DeltaStorage.getDiffStats(diff);

      expect(stats).toEqual({
        additions: 11,
        deletions: 0,
        unchanged: 0
      });
    });

    test('should handle diff with only deletions', () => {
      const diff = [[-1, 'removed']];
      const stats = DeltaStorage.getDiffStats(diff);

      expect(stats).toEqual({
        additions: 0,
        deletions: 7,
        unchanged: 0
      });
    });

    test('should handle empty diff', () => {
      const stats = DeltaStorage.getDiffStats([]);

      expect(stats).toEqual({
        additions: 0,
        deletions: 0,
        unchanged: 0
      });
    });

    test('should throw TypeError for non-array input', () => {
      expect(() => DeltaStorage.getDiffStats(null)).toThrow(TypeError);
      expect(() => DeltaStorage.getDiffStats('not array')).toThrow(TypeError);
    });
  });

  describe('Integration tests', () => {
    test('should handle large content', () => {
      // Create 10KB of content
      const largeContent = 'a'.repeat(10000);
      const modifiedContent = 'b'.repeat(10000);

      const diff = DeltaStorage.createDiff(largeContent, modifiedContent);
      const reconstructed = DeltaStorage.applyDiff(largeContent, diff);

      expect(reconstructed).toBe(modifiedContent);
    });

    test('should handle realistic wiki page scenario', () => {
      const v1 = `# Welcome to ngdpbase

This is the first version of our wiki page.

## Features
- Markdown support
- Fast search`;

      const v2 = `# Welcome to ngdpbase

This is the second version of our wiki page.

## Features
- Markdown support
- Fast search
- Version control`;

      const v3 = `# Welcome to ngdpbase

This is the third version of our wiki page with more content.

## Features
- Markdown support
- Fast and powerful search
- Version control
- Page history`;

      // Create diffs
      const diff1to2 = DeltaStorage.createDiff(v1, v2);
      const diff2to3 = DeltaStorage.createDiff(v2, v3);

      // Reconstruct v2 from v1
      const reconstructedV2 = DeltaStorage.applyDiff(v1, diff1to2);
      expect(reconstructedV2).toBe(v2);

      // Reconstruct v3 from v1 using diff chain
      const reconstructedV3 = DeltaStorage.applyDiffChain(v1, [diff1to2, diff2to3]);
      expect(reconstructedV3).toBe(v3);

      // Verify hashes
      const v3Hash = DeltaStorage.calculateHash(v3);
      expect(DeltaStorage.verifyHash(reconstructedV3, v3Hash)).toBe(true);
    });
  });
});
