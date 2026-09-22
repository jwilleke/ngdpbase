/**
 * Tests for AttachPlugin
 *
 * AttachPlugin renders wiki attachments inline. It uses MIME type from
 * AttachmentManager.resolveAttachmentSrc() to decide how to render:
 *   - image/* → clickable <img> wrapped in <a class="attach-image-link">
 *   - anything else → download link with file-type icon
 *
 * These tests mock resolveAttachmentSrc directly.
 */

import AttachPluginModule from '../AttachPlugin' ;
import type { SimplePlugin } from '../types';
const AttachPlugin = AttachPluginModule as unknown as SimplePlugin;
const VIEWER = { username: 'molly', roles: ['editor'], isAuthenticated: true };

function makeContext(resolvedValue) {
  const mockAttachmentManager = {
    resolveAttachmentSrc: vi.fn().mockResolvedValue(resolvedValue)
  };
  return {
    pageName: 'TestPage',
    linkGraph: {},
    // #1400: the viewer — the resolver needs it to reach their own sealed files.
    userContext: VIEWER,
    engine: {
      getManager: vi.fn().mockImplementation((name) => {
        if (name === 'AttachmentManager') return mockAttachmentManager;
        return null;
      })
    },
    _attachmentManager: mockAttachmentManager
  };
}

describe('AttachPlugin', () => {
  describe('plugin metadata', () => {
    it('has correct name', () => {
      expect(AttachPlugin.name).toBe('ATTACH');
    });

    it('has execute method', () => {
      expect(typeof AttachPlugin.execute).toBe('function');
    });
  });

  describe('image MIME type → renders as image', () => {
    it('image/webp → renders as <img> wrapped in <a>', async () => {
      const context = makeContext({ url: '/attachments/abc123', mimeType: 'image/webp' });
      const result = await AttachPlugin.execute(context, { src: 'photo.webp' });

      expect(result).toContain('<img');
      expect(result).toContain('src="/attachments/abc123"');
      expect(result).toContain('class="attach-image-link"');
      expect(result).toContain('</a>');
      expect(result).not.toContain('attachment-link');
    });

    it('image/png → renders as <img>', async () => {
      const context = makeContext({ url: '/attachments/def456', mimeType: 'image/png' });
      const result = await AttachPlugin.execute(context, { src: 'photo.png' });

      expect(result).toContain('<img');
      expect(result).toContain('src="/attachments/def456"');
    });

    it('image/jpeg → renders as <img>', async () => {
      const context = makeContext({ url: '/attachments/ghi789', mimeType: 'image/jpeg' });
      const result = await AttachPlugin.execute(context, { src: 'photo.jpg' });

      expect(result).toContain('<img');
      expect(result).toContain('src="/attachments/ghi789"');
    });
  });

  describe('non-image MIME type → renders as download link', () => {
    it('application/pdf → renders as download link', async () => {
      const context = makeContext({ url: '/attachments/doc123', mimeType: 'application/pdf' });
      const result = await AttachPlugin.execute(context, { src: 'doc.pdf' });

      expect(result).toContain('class="attachment-link"');
      expect(result).toContain('href="/attachments/doc123"');
      expect(result).toContain('target="_blank"');
      expect(result).not.toContain('<img');
    });

    it('video/mp4 → renders as download link', async () => {
      const context = makeContext({ url: '/attachments/vid123', mimeType: 'video/mp4' });
      const result = await AttachPlugin.execute(context, { src: 'movie.mp4' });

      expect(result).toContain('class="attachment-link"');
      expect(result).not.toContain('<img');
    });

    it('application/octet-stream → renders as download link', async () => {
      const context = makeContext({ url: '/attachments/bin123', mimeType: 'application/octet-stream' });
      const result = await AttachPlugin.execute(context, { src: 'file.bin' });

      expect(result).toContain('class="attachment-link"');
      expect(result).not.toContain('<img');
    });
  });

  describe('attachment not found', () => {
    it('resolveAttachmentSrc returns null → attachment-missing span', async () => {
      const context = makeContext(null);
      const result = await AttachPlugin.execute(context, { src: 'missing.jpg' });

      expect(result).toContain('class="attachment-missing"');
      expect(result).toContain('missing.jpg');
      expect(result).not.toContain('<img');
    });

    it('no AttachmentManager → attachment-missing span', async () => {
      const context = {
        pageName: 'TestPage',
        linkGraph: {},
        engine: {
          getManager: vi.fn().mockReturnValue(null)
        }
      };
      const result = await AttachPlugin.execute(context, { src: 'photo.jpg' });

      expect(result).toContain('class="attachment-missing"');
    });
  });

  describe('missing src', () => {
    it('no src param → error span', async () => {
      const context = makeContext(null);
      const result = await AttachPlugin.execute(context, {});

      expect(result).toContain('class="error"');
      expect(result).toContain('src is required');
    });
  });

  describe('positional syntax', () => {
    it('[{ATTACH photo.jpg}] → resolves and renders as image', async () => {
      const context = makeContext({ url: '/attachments/abc123', mimeType: 'image/jpeg' });
      context.originalMatch = '[{ATTACH photo.jpg}]';
      const result = await AttachPlugin.execute(context, {});

      expect(result).toContain('<img');
      expect(context._attachmentManager.resolveAttachmentSrc).toHaveBeenCalledWith(
        'photo.jpg',
        'TestPage',
        VIEWER
      );
    });

    it('[{ATTACH photo.jpg|My Caption}] → parses filename and caption', async () => {
      const context = makeContext({ url: '/attachments/abc123', mimeType: 'image/jpeg' });
      context.originalMatch = '[{ATTACH photo.jpg|My Caption}]';
      const result = await AttachPlugin.execute(context, {});

      expect(result).toContain('<img');
      expect(result).toContain('alt="My Caption"');
    });

    it('[{ATTACH report.pdf|Annual Report}] → download link with caption as text', async () => {
      const context = makeContext({ url: '/attachments/pdf123', mimeType: 'application/pdf' });
      context.originalMatch = '[{ATTACH report.pdf|Annual Report}]';
      const result = await AttachPlugin.execute(context, {});

      expect(result).toContain('class="attachment-link"');
      expect(result).toContain('Annual Report');
    });
  });

  describe('image rendering options', () => {
    it('caption displayed below image', async () => {
      const context = makeContext({ url: '/attachments/abc123', mimeType: 'image/jpeg' });
      const result = await AttachPlugin.execute(context, {
        src: 'photo.jpg',
        caption: 'My Caption'
      });

      expect(result).toContain('class="image-plugin-container');
      expect(result).toContain('>My Caption</div>');
    });

    it('align=left with display=float → float styles', async () => {
      const context = makeContext({ url: '/attachments/abc123', mimeType: 'image/jpeg' });
      const result = await AttachPlugin.execute(context, {
        src: 'photo.jpg',
        align: 'left',
        display: 'float'
      });

      expect(result).toContain('float: left;');
    });

    it('width and height passed through', async () => {
      const context = makeContext({ url: '/attachments/abc123', mimeType: 'image/jpeg' });
      const result = await AttachPlugin.execute(context, {
        src: 'photo.jpg',
        width: '300',
        height: '200'
      });

      expect(result).toContain('width="300"');
      expect(result).toContain('height="200"');
    });

    it('custom class applied to img', async () => {
      const context = makeContext({ url: '/attachments/abc123', mimeType: 'image/jpeg' });
      const result = await AttachPlugin.execute(context, {
        src: 'photo.jpg',
        class: 'my-image-class'
      });

      expect(result).toContain('class="my-image-class"');
    });

    it('target applied to image link anchor', async () => {
      const context = makeContext({ url: '/attachments/abc123', mimeType: 'image/jpeg' });
      const result = await AttachPlugin.execute(context, {
        src: 'photo.jpg',
        target: '_self'
      });

      expect(result).toContain('target="_self"');
    });
  });

  describe('file rendering options', () => {
    it('custom class applied to file link', async () => {
      const context = makeContext({ url: '/attachments/doc123', mimeType: 'application/pdf' });
      const result = await AttachPlugin.execute(context, {
        src: 'doc.pdf',
        class: 'my-link-class'
      });

      expect(result).toContain('my-link-class');
    });

    it('custom target on file link', async () => {
      const context = makeContext({ url: '/attachments/doc123', mimeType: 'application/pdf' });
      const result = await AttachPlugin.execute(context, {
        src: 'doc.pdf',
        target: '_self'
      });

      expect(result).toContain('target="_self"');
    });

    it('caption used as link text for files', async () => {
      const context = makeContext({ url: '/attachments/doc123', mimeType: 'application/pdf' });
      const result = await AttachPlugin.execute(context, {
        src: 'doc.pdf',
        caption: 'Download Report'
      });

      expect(result).toContain('Download Report');
    });

    it('PDF file gets pdf icon class', async () => {
      const context = makeContext({ url: '/attachments/doc123', mimeType: 'application/pdf' });
      const result = await AttachPlugin.execute(context, { src: 'report.pdf' });

      expect(result).toContain('attachment-icon-pdf');
    });

    it('video file gets video icon class regardless of MIME type', async () => {
      const context = makeContext({ url: '/attachments/vid123', mimeType: 'video/mp4' });
      const result = await AttachPlugin.execute(context, { src: 'movie.mp4' });

      expect(result).toContain('attachment-icon-video');
    });
  });

  describe('resolveAttachmentSrc called with correct args', () => {
    it('passes filename and pageName to resolveAttachmentSrc', async () => {
      const context = makeContext({ url: '/attachments/abc123', mimeType: 'image/jpeg' });
      await AttachPlugin.execute(context, { src: 'photo.jpg' });

      expect(context._attachmentManager.resolveAttachmentSrc).toHaveBeenCalledWith(
        'photo.jpg',
        'TestPage',
        VIEWER
      );
    });
  });

  describe('error handling', () => {
    it('resolveAttachmentSrc throwing → error span', async () => {
      const mockAttachmentManager = {
        resolveAttachmentSrc: vi.fn().mockRejectedValue(new Error('Provider error'))
      };
      const context = {
        pageName: 'TestPage',
        linkGraph: {},
        engine: {
          getManager: vi.fn().mockImplementation((name) => {
            if (name === 'AttachmentManager') return mockAttachmentManager;
            return null;
          })
        }
      };
      const result = await AttachPlugin.execute(context, { src: 'photo.jpg' });

      expect(result).toContain('class="error"');
    });
  });
});
