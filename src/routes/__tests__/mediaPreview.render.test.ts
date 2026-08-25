/**
 * Render tests for the media preview partial (#1098).
 *
 * These render the real template rather than asserting on its source, because
 * the defect being fixed was a *branch selection* error: `.avi`, `.wmv`,
 * `.mkv` and later `.m2ts` all took the player branch and produced controls
 * that did nothing. Nothing caught it for as long as it existed, and the
 * reason is that the block could not be rendered without a whole page's worth
 * of locals — so it never was.
 *
 * @jest-environment node
 */

import { describe, it, expect } from 'vitest';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isDefinitelyUnplayable } from '../../utils/videoPlayability.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../../views');
const PARTIAL = path.join(VIEWS, '_media-preview.ejs');

interface Item {
  id: string;
  filename: string;
  mimeType: string;
  metadata?: { videoCodec?: string };
}

/** Render the partial exactly as the page does, deriving the flag the route derives. */
async function render(item: Item): Promise<string> {
  return ejs.renderFile(PARTIAL, {
    item,
    unplayableVideo: isDefinitelyUnplayable(item.mimeType, item.metadata?.videoCodec)
  });
}

const video = (filename: string, mimeType: string, videoCodec?: string): Item => ({
  id: 'abc123',
  filename,
  mimeType,
  metadata: videoCodec ? { videoCodec } : undefined
});

describe('_media-preview.ejs (#1098)', () => {
  describe('containers no browser decodes', () => {
    it.each([
      ['m2ts', 'clip.m2ts', 'video/mp2t'],
      ['avi', 'clip.avi', 'video/x-msvideo'],
      ['wmv', 'clip.wmv', 'video/x-ms-wmv']
    ])('shows a poster and a download for .%s, never a player', async (_ext, name, mime) => {
      const html = await render(video(name, mime));

      expect(html).not.toContain('<video');
      expect(html).toContain('/media/thumb/abc123');
      expect(html).toContain('/media/file/abc123');
      expect(html).toContain('cannot play in a browser');
    });

    it('names the format so the message is actionable', async () => {
      const html = await render(video('holiday.m2ts', 'video/mp2t'));
      expect(html).toContain('M2TS');
    });

    it('treats ProRes in a playable wrapper the same way', async () => {
      const html = await render(video('edit.mov', 'video/quicktime', 'Apple ProRes 422'));
      expect(html).not.toContain('<video');
      expect(html).toContain('/media/thumb/abc123');
    });
  });

  describe('containers worth trying', () => {
    it.each([
      ['mp4', 'clip.mp4', 'video/mp4'],
      ['mov', 'clip.mov', 'video/quicktime'],
      ['webm', 'clip.webm', 'video/webm']
    ])('renders a real player for .%s', async (_ext, name, mime) => {
      const html = await render(video(name, mime));
      expect(html).toContain('<video');
      expect(html).toContain('/media/file/abc123');
    });

    it('renders a player for Matroska — the browser decides, not the server', async () => {
      // Chromium commonly plays H.264-in-Matroska; Safari never does. Refusing
      // it server-side would take a working player away from Chrome users.
      const html = await render(video('clip.mkv', 'video/x-matroska'));
      expect(html).toContain('<video');
    });

    it('ships a runtime fallback, because the <video> inline fallback never fires on a decode failure', async () => {
      const html = await render(video('clip.mkv', 'video/x-matroska'));
      expect(html).toContain('mediaVideoFallback');
      expect(html).toContain("addEventListener('error'");
      // The fallback must offer the same two things the server-side branch does.
      expect(html).toContain('/media/thumb/abc123');
      expect(html).toContain('Download');
    });
  });

  describe('other types are unchanged', () => {
    it('renders an image for an image', async () => {
      const html = await render({ id: 'abc123', filename: 'photo.jpg', mimeType: 'image/jpeg' });
      expect(html).toContain('<img');
      expect(html).not.toContain('<video');
    });

    it('keeps the generic icon for a non-media file, which has no poster frame', async () => {
      const html = await render({ id: 'abc123', filename: 'notes.pdf', mimeType: 'application/pdf' });
      expect(html).toContain('fa-file');
      expect(html).not.toContain('<video');
      expect(html).not.toContain('/media/thumb/abc123');
    });
  });
});
