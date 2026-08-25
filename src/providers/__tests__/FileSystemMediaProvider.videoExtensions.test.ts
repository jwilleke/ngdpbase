/**
 * Video extension / MIME pairing for the media provider (#1097).
 *
 * Indexing an extension without giving it a MIME type is a half-working state
 * rather than an obvious failure: `mimeType` falls back to
 * `application/octet-stream`, and `getThumbnailBuffer` gates on
 * `mimeType.startsWith('video/')`, so the file indexes with a capture date and
 * a search entry but no poster frame. These tests pin both halves together so
 * a future extension cannot be added to only one of the two lists.
 *
 * @jest-environment node
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_MEDIA_EXTENSIONS } from '../FileSystemMediaProvider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const providerSource = fs.readFileSync(
  path.join(__dirname, '../FileSystemMediaProvider.ts'),
  'utf8'
);

/**
 * The MIME map is module-private, so read the declared pairs out of the
 * source. Importing it would mean exporting it purely for a test, which is a
 * worse trade than parsing the table it is written as.
 */
function declaredMimeExtensions(): Set<string> {
  const block = providerSource.match(/const MIME_MAP: Record<string, string> = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error('MIME_MAP not found in FileSystemMediaProvider.ts');
  const found = new Set<string>();
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\s*'?([A-Za-z0-9]+)'?\s*:\s*'/);
    if (m) found.add(m[1].toLowerCase());
  }
  return found;
}

describe('media extensions and MIME types (#1097)', () => {
  it('indexes .m2ts', () => {
    expect(DEFAULT_MEDIA_EXTENSIONS).toContain('m2ts');
  });

  it('types .m2ts as video, so it gets a poster frame rather than a generic icon', () => {
    expect(declaredMimeExtensions()).toContain('m2ts');
    expect(providerSource).toMatch(/m2ts: 'video\/mp2t'/);
  });

  it('gives every indexed extension a MIME type', () => {
    const mimes = declaredMimeExtensions();
    const missing = DEFAULT_MEDIA_EXTENSIONS.filter(ext => !mimes.has(ext));
    expect(missing).toEqual([]);
  });

  it('keeps the shipped config in step with the code default', async () => {
    const configPath = path.join(__dirname, '../../../config/app-default-config.json');
    const config = await fs.readJson(configPath);
    // Config keys are FLAT dotted strings, not a nested object.
    expect(config['ngdpbase.media.extensions']).toEqual(DEFAULT_MEDIA_EXTENSIONS);
  });
});
