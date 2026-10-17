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

  // #1861: add-ons get core's Express through the engine, never their own import.
  describe('createRouter / serveStatic', () => {
    test('createRouter returns a working Express Router that honours its options', async () => {
      engine = new WikiEngine();
      const express = (await import('express')).default;
      const request = (await import('supertest')).default;
      const router = engine.createRouter({ caseSensitive: true });
      router.get('/Ping', (_req, res) => { res.json({ ok: true }); });
      const app = express();
      app.use('/api', router);
      expect((await request(app).get('/api/Ping')).body).toEqual({ ok: true });
      expect((await request(app).get('/api/ping')).status).toBe(404);
    });

    test('serveStatic serves files from the folder it is given', async () => {
      engine = new WikiEngine();
      const express = (await import('express')).default;
      const request = (await import('supertest')).default;
      await fs.writeFile(path.join(testDir, 'hello.txt'), 'hi');
      const app = express();
      app.use('/static', engine.serveStatic(testDir));
      const res = await request(app).get('/static/hello.txt');
      expect(res.status).toBe(200);
      expect(res.text).toBe('hi');
    });
  });
});
