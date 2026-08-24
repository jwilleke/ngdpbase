/**
 * Test script for bulk attachment import
 * Tests importing 5 files from a source directory
 */

// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment and silently operates on ./data.
import '../src/bootstrap-env.js';
import path from 'path';
import fs from 'fs-extra';

// MIME type lookup
const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain'
};

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

async function testBulkImport() {
  const sourceDir = '/mnt/tank/jims/data/systems/wikis/images/';
  const limit = 5;

  console.log('=== Bulk Attachment Import Test ===\n');
  console.log(`Source: ${sourceDir}`);
  console.log(`Limit: ${limit} files\n`);

  // Import WikiEngine
  import WikiEngine from '../dist/src/WikiEngine.js';

  // Initialize engine
  console.log('Initializing WikiEngine...');
  const engine = new WikiEngine({}, null);
  await engine.initialize({});
  console.log('WikiEngine initialized.\n');

  // Get AttachmentManager
  const attachmentManager = engine.getManager('AttachmentManager');
  if (!attachmentManager) {
    console.error('ERROR: AttachmentManager not available');
    await engine.shutdown();
    process.exit(1);
  }

  // Read directory
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const files = entries
    .filter(e => e.isFile() && !e.name.startsWith('.'))
    .slice(0, limit);

  console.log(`Found ${entries.filter(e => e.isFile()).length} total files, importing ${files.length}:\n`);

  const results = [];
  const uploadContext = {
    username: 'test-import',
    name: 'Test Import Script',
    isAuthenticated: true,
    roles: ['admin']
  };

  for (const file of files) {
    const filePath = path.join(sourceDir, file.name);
    const filename = file.name;

    try {
      const fileBuffer = await fs.readFile(filePath);
      const mimeType = getMimeType(filename);

      const fileInfo = {
        originalName: filename,
        mimeType,
        size: fileBuffer.length
      };

      const options = {
        description: filename,
        context: uploadContext
      };

      const result = await attachmentManager.uploadAttachment(fileBuffer, fileInfo, options);

      results.push({
        filename,
        success: true,
        attachmentId: result.identifier,
        size: fileBuffer.length,
        mimeType
      });

      console.log(`✓ ${filename}`);
      console.log(`  ID: ${result.identifier}`);
      console.log(`  Size: ${(fileBuffer.length / 1024).toFixed(1)} KB`);
      console.log(`  Type: ${mimeType}\n`);

    } catch (error) {
      results.push({
        filename,
        success: false,
        error: error.message
      });
      console.log(`✗ ${filename}`);
      console.log(`  Error: ${error.message}\n`);
    }
  }

  // Summary
  const uploaded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalSize = results
    .filter(r => r.success && r.size)
    .reduce((sum, r) => sum + r.size, 0);

  console.log('=== Summary ===');
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total size: ${(totalSize / 1024).toFixed(1)} KB`);

  // Verify by listing all attachments
  console.log('\n=== Verification ===');
  const allAttachments = await attachmentManager.getAllAttachments();
  console.log(`Total attachments in system: ${allAttachments.length}`);

  // Show the ones we just uploaded
  console.log('\nJust uploaded:');
  for (const r of results.filter(r => r.success)) {
    const meta = await attachmentManager.getAttachmentMetadata(r.attachmentId);
    if (meta) {
      console.log(`  - ${meta.name || r.filename} (${r.attachmentId})`);
    }
  }

  // Shutdown
  await engine.shutdown();
  console.log('\nDone!');
}

testBulkImport().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
