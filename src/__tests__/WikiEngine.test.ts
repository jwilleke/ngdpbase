import path from 'path';
import fs from 'fs-extra';
import WikiEngine from '../WikiEngine';

// Logger is mocked globally in vi.setup.js

describe('WikiEngine', () => {
  let engine;
  let testDir;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-engine-' + Date.now());
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    if (engine) {
      await engine.shutdown();
    }
    try {
      await fs.remove(testDir);
    } catch {
      // Directory might not exist
    }
  });

  describe('initialization', () => {
    test('should create engine instance', () => {
      engine = new WikiEngine();
      expect(engine).toBeTruthy();
      expect(typeof engine.initialize).toBe('function');
    });

    test('should initialize with default configuration', async () => {
      engine = new WikiEngine();
      
      const config = {
        name: 'Test Wiki',
        pagesDirectory: path.join(testDir, 'pages')
      };

      await engine.initialize(config);
      
      expect(engine.initialized).toBe(true);
    });
  });

  describe('manager access', () => {
    beforeEach(async () => {
      engine = new WikiEngine();
      const config = {
        name: 'Test Wiki',
        pagesDirectory: path.join(testDir, 'pages')
      };
      await engine.initialize(config);
    });

    test('should return manager by name', () => {
      const pageManager = engine.getManager('PageManager');
      expect(pageManager).toBeTruthy();
    });

    test('should return undefined for non-existent manager', () => {
      const nonExistentManager = engine.getManager('NonExistentManager');
      expect(nonExistentManager).toBeUndefined();
    });
  });

  describe('lifecycle management', () => {
    test('should handle shutdown gracefully', async () => {
      engine = new WikiEngine();
      
      const config = {
        name: 'Test Wiki',
        pagesDirectory: path.join(testDir, 'pages')
      };

      await engine.initialize(config);
      expect(engine.initialized).toBe(true);
      
      await engine.shutdown();
      expect(engine.initialized).toBe(false);
    });
  });
});
