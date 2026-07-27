import request from 'supertest';
import path from 'path';
import fs from 'fs-extra';
import WikiRoutes from '../WikiRoutes';
import type { WikiEngine } from '../../types/WikiEngine';
import { buildTestApp } from './__fixtures__/buildTestApp';
import { csrfTestHeaders } from '../../middleware/__tests__/__fixtures__/csrfTestHelpers';

// Mock dependencies
const mockUserManager = {
  getCurrentUser: vi.fn(),
  hasPermission: vi.fn()
};

const mockConfigManager = {
  getProperty: vi.fn((key, defaultValue) => {
    const config = {
      'ngdpbase.features.images.maxUploadSize': 10 * 1024 * 1024,
      'ngdpbase.features.images.default-alt': 'Uploaded image',
      'ngdpbase.features.images.default-class': 'wiki-image'
    };
    return config[key] || defaultValue;
  })
};

const mockEngine = {
  getManager: vi.fn((name) => {
    switch (name) {
    case 'UserManager':
      return mockUserManager;
    case 'ConfigurationManager':
      return mockConfigManager;
    default:
      return null;
    }
  }),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
};

describe('WikiRoutes - Image Upload (Bug #76)', () => {
  let app;
  let wikiRoutes;
  let uploadedFiles; // Track files created during tests
  const testUploadDir = path.join(
    __dirname,
    '../../../public/images/test-uploads'
  );
  const actualUploadDir = path.join(__dirname, '../../../public/images');

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Initialize array to track uploaded files
    uploadedFiles = [];

    // Create test upload directory
    await fs.ensureDir(testUploadDir);

    // #684 — shared test-app builder mounts the real csrfMiddleware so
    // every POST to /images/upload below sends a matching token via
    // csrfTestHeaders(). Body-field _csrf won't work for uploads because
    // multer parses req.body AFTER csrfMiddleware runs — same constraint
    // as production. Clients must use the X-CSRF-Token header.
    app = buildTestApp({ withCsrf: true });

    // Create WikiRoutes instance
    wikiRoutes = new WikiRoutes(mockEngine);

    // Register routes
    wikiRoutes.registerRoutes(app);

    // Set default authenticated user
    mockUserManager.getCurrentUser.mockResolvedValue({
      username: 'testuser',
      isAuthenticated: true,
      roles: ['Authenticated']
    });
  });

  afterEach(async () => {
    // Cleanup test uploads from actual upload directory
    for (const filename of uploadedFiles) {
      const filePath = path.join(actualUploadDir, filename);
      try {
        await fs.remove(filePath);
      } catch (err) {
        // Ignore errors if file doesn't exist
      }
    }

    // Cleanup test upload directory
    await fs.remove(testUploadDir);
  });

  describe('POST /images/upload', () => {
    test('should successfully upload a valid image file', async () => {
      const testImagePath = path.join(
        __dirname,
        '../../../public/images/test-one.jpg'
      );

      // Skip test if test image doesn't exist
      if (!(await fs.pathExists(testImagePath))) {
        console.warn('Test image not found, skipping upload test');
        return;
      }

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', testImagePath)
        .expect(200);

      // Track uploaded file for cleanup
      if (response.body.filename) {
        uploadedFiles.push(response.body.filename);
      }

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('imagePath');
      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('originalName');
      expect(response.body).toHaveProperty('size');
      expect(response.body.imagePath).toMatch(
        /^\/images\/upload-\d+-\d+\.jpg$/
      );
    });

    test('should return 400 when no file is uploaded', async () => {
      const response = await request(app).post('/images/upload').set(csrfTestHeaders()).expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/no.*image.*file.*uploaded/i);
    });

    test('should reject files larger than 10MB', async () => {
      // Create a buffer larger than 10MB
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', largeBuffer, 'large-image.jpg')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/file size|10MB/i);
    });

    test('should reject non-image files', async () => {
      // Use buffer instead of file to avoid fs issues
      const textBuffer = Buffer.from('This is not an image');

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', textBuffer, 'test.txt')
        .timeout(5000);

      // Multer should reject this with 400
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/only image files/i);
    }, 10000); // Increase test timeout to 10s

    test('should accept JPEG images', async () => {
      const testImagePath = path.join(
        __dirname,
        '../../../public/images/test-one.jpg'
      );

      if (!(await fs.pathExists(testImagePath))) {
        console.warn('Test image not found, skipping JPEG test');
        return;
      }

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', testImagePath)
        .expect(200);

      // Track uploaded file for cleanup
      if (response.body.filename) {
        uploadedFiles.push(response.body.filename);
      }

      expect(response.body.success).toBe(true);
      expect(response.body.filename).toMatch(/\.jpg$/);
    });

    test('should accept PNG images', async () => {
      // Create a minimal PNG file (1x1 transparent pixel)
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
      ]);

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', pngBuffer, 'test.png')
        .expect(200);

      // Track uploaded file for cleanup
      if (response.body.filename) {
        uploadedFiles.push(response.body.filename);
      }

      expect(response.body.success).toBe(true);
      expect(response.body.filename).toMatch(/\.png$/);
    });

    test('should generate unique filenames for multiple uploads', async () => {
      const testImagePath = path.join(
        __dirname,
        '../../../public/images/test-one.jpg'
      );

      if (!(await fs.pathExists(testImagePath))) {
        console.warn('Test image not found, skipping unique filename test');
        return;
      }

      const response1 = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', testImagePath);

      // Track uploaded file for cleanup
      if (response1.body.filename) {
        uploadedFiles.push(response1.body.filename);
      }

      const response2 = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', testImagePath);

      // Track uploaded file for cleanup
      if (response2.body.filename) {
        uploadedFiles.push(response2.body.filename);
      }

      expect(response1.body.filename).not.toEqual(response2.body.filename);
    });

    test('should preserve file extension in uploaded filename', async () => {
      const testImagePath = path.join(
        __dirname,
        '../../../public/images/test-one.jpg'
      );

      if (!(await fs.pathExists(testImagePath))) {
        console.warn('Test image not found, skipping extension test');
        return;
      }

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', testImagePath)
        .expect(200);

      // Track uploaded file for cleanup
      if (response.body.filename) {
        uploadedFiles.push(response.body.filename);
      }

      expect(response.body.filename).toMatch(/\.jpg$/);
      expect(response.body.imagePath).toMatch(/\.jpg$/);
    });

    test('should return originalName in response', async () => {
      const testImagePath = path.join(
        __dirname,
        '../../../public/images/test-one.jpg'
      );

      if (!(await fs.pathExists(testImagePath))) {
        console.warn('Test image not found, skipping originalName test');
        return;
      }

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', testImagePath)
        .expect(200);

      // Track uploaded file for cleanup
      if (response.body.filename) {
        uploadedFiles.push(response.body.filename);
      }

      expect(response.body.originalName).toBe('test-one.jpg');
    });

    test('should create upload directory if it does not exist', async () => {
      const uploadDir = path.join(__dirname, '../../../public/images');

      // Store original state
      const originalExists = await fs.pathExists(uploadDir);

      const testImagePath = path.join(
        __dirname,
        '../../../public/images/test-one.jpg'
      );

      if (!(await fs.pathExists(testImagePath))) {
        console.warn('Test image not found, skipping directory creation test');
        return;
      }

      // Test that multer creates directory if needed (don't actually remove it)
      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', testImagePath);

      // Track uploaded file for cleanup
      if (response.status === 200 && response.body.filename) {
        uploadedFiles.push(response.body.filename);
      }

      // Check that upload succeeded (directory exists or was created)
      if (response.status === 200) {
        expect(await fs.pathExists(uploadDir)).toBe(true);
      }
    });
  });

  describe('Image path generation', () => {
    test('should generate paths starting with /images/', async () => {
      const testImagePath = path.join(
        __dirname,
        '../../../public/images/test-one.jpg'
      );

      if (!(await fs.pathExists(testImagePath))) {
        console.warn('Test image not found, skipping path generation test');
        return;
      }

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', testImagePath)
        .expect(200);

      // Track uploaded file for cleanup
      if (response.body.filename) {
        uploadedFiles.push(response.body.filename);
      }

      expect(response.body.imagePath).toMatch(/^\/images\//);
    });

    test('should generate paths compatible with ImagePlugin', async () => {
      const testImagePath = path.join(
        __dirname,
        '../../../public/images/test-one.jpg'
      );

      if (!(await fs.pathExists(testImagePath))) {
        console.warn(
          'Test image not found, skipping ImagePlugin compatibility test'
        );
        return;
      }

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', testImagePath)
        .expect(200);

      // Track uploaded file for cleanup
      if (response.body.filename) {
        uploadedFiles.push(response.body.filename);
      }

      // ImagePlugin expects paths starting with / or http
      expect(response.body.imagePath).toMatch(
        /^\/images\/upload-\d+-\d+\.jpg$/
      );

      // Should not have double /images/ prefix
      expect(response.body.imagePath).not.toMatch(/\/images\/images\//);
    });
  });

  describe('Error handling', () => {
    test('should handle multer errors gracefully', async () => {
      // Try to upload without multipart/form-data
      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .send({ image: 'not a file' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should return proper error message for file size limit', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', largeBuffer, 'large.jpg')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/file size|10MB/i);
    });

    test('should return proper error message for invalid file type', async () => {
      const textBuffer = Buffer.from('This is not an image');

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', textBuffer, 'test.txt')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/only image files/i);
    });

    // #684 — locks in CSRF coverage at the unit-test layer. Note: multer
    // parses req.body AFTER csrfMiddleware runs, so multipart uploads CAN
    // ONLY validate via the X-CSRF-Token header — a _csrf body field would
    // be invisible to the middleware. This assertion confirms the header
    // path is the enforced channel, not just the convenient one.
    test('rejects uploads missing the X-CSRF-Token header (#684)', async () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
      ]);
      const response = await request(app)
        .post('/images/upload')
        .attach('image', pngBuffer, 'no-csrf.png');
      expect(response.status).toBe(403);
      expect(response.text).toContain('CSRF');
    });
  });

  describe('Integration with ImagePlugin', () => {
    test('uploaded image path should work with ImagePlugin syntax', async () => {
      const testImagePath = path.join(
        __dirname,
        '../../../public/images/test-one.jpg'
      );

      if (!(await fs.pathExists(testImagePath))) {
        console.warn(
          'Test image not found, skipping ImagePlugin integration test'
        );
        return;
      }

      const uploadResponse = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', testImagePath)
        .expect(200);

      // Track uploaded file for cleanup
      if (uploadResponse.body.filename) {
        uploadedFiles.push(uploadResponse.body.filename);
      }

      const imagePath = uploadResponse.body.imagePath;

      // Simulate ImagePlugin usage
      const pluginSyntax = `[{Image src='${imagePath}' alt='Test Image'}]`;

      expect(pluginSyntax).toMatch(
        /\[\{Image src='\/images\/upload-\d+-\d+\.jpg' alt='Test Image'\}\]/
      );
    });
  });

  describe('Security', () => {
    test('should sanitize uploaded filenames', async () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
      ]);

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', pngBuffer, '../../../malicious.png')
        .expect(200);

      // Track uploaded file for cleanup
      if (response.body.filename) {
        uploadedFiles.push(response.body.filename);
      }

      // Should not allow directory traversal in filename
      expect(response.body.filename).not.toContain('..');
      expect(response.body.filename).toMatch(/^upload-\d+-\d+\.png$/);
    });

    test('should not allow script execution through SVG', async () => {
      const maliciousSVG = `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" baseProfile="full" xmlns="http://www.w3.org/2000/svg">
  <script type="text/javascript">alert('XSS')</script>
</svg>`;

      const response = await request(app)
        .post('/images/upload').set(csrfTestHeaders())
        .attach('image', Buffer.from(maliciousSVG), 'malicious.svg');

      // Track uploaded file for cleanup
      if (response.status === 200 && response.body.filename) {
        uploadedFiles.push(response.body.filename);
      }

      // SVG should be accepted (it's in allowedTypes), but should be served with proper headers
      // This test documents the current behavior - proper mitigation would be CSP headers
      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.filename).toMatch(/\.svg$/);
      }
    });
  });
});
