/**
 * Attach plugin for ngdpbase
 * Renders wiki attachments inline in page content.
 *
 * Supports two syntax forms (consistent with ImagePlugin):
 *
 * Named params (preferred):
 *   [{ATTACH src='filename.pdf'}]
 *   [{ATTACH src='photo.jpg' caption='My Photo' align='left' display='float'}]
 *
 * Positional params (legacy/JSPWiki style, also supported):
 *   [{ATTACH filename.pdf}]
 *   [{ATTACH photo.jpg|Caption Text}]
 *
 * Parameters:
 *   src      (required) - Attachment filename. Resolved via AttachmentManager.
 *   caption  (optional) - Caption text. Also used as alt text for images.
 *   align    (optional) - Alignment: left | right | center
 *   display  (optional) - Display mode for images: block (default) | float | inline | full
 *   style    (optional) - Custom inline CSS
 *   class    (optional) - Custom CSS class
 *   target   (optional) - Link target (default: _blank for file downloads, none for images)
 *   width    (optional) - Image width (images only)
 *   height   (optional) - Image height (images only)
 *
 * For image attachments (MIME type image/*):
 *   Renders as a clickable image linking to the full attachment URL.
 *
 * For all other attachments (pdf, doc, zip, etc.):
 *   Renders as a download link with a file-type icon.
 *
 * Resolution uses AttachmentManager.resolveAttachmentSrc() — the same canonical
 * method as ImagePlugin. See docs/managers/AttachmentManager.md for the full
 * resolution order.
 *
 * When to use:
 *   Use [{ATTACH}] as the default for inserting wiki attachments.
 *   Use [{Image}] only when you need captions, float/display control, or external URLs.
 *   See docs/user-guide/Content-Management.md for guidance.
 *
 * Related issue: #274 [{ATTACH filename}] produces "Plugin 'ATTACH' not found"
 */

import type { ActorContext } from '../context/ActorContext.js';
import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { renderImageHtml } from './renderImage.js';
import { escapeHtml } from '../utils/pluginFormatters.js';

interface AttachmentManager {
  resolveAttachmentSrc(src: string, pageName: string, ctx: ActorContext): Promise<{ url: string; mimeType: string } | null>;
}

interface AttachParams extends PluginParams {
  src?: string;
  caption?: string;
  align?: string;
  display?: string;
  style?: string;
  class?: string;
  target?: string;
  width?: string | number;
  height?: string | number;
}

function getFileIconClass(filename: string): string {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const iconMap: Record<string, string> = {
    pdf: 'pdf',
    doc: 'word', docx: 'word',
    xls: 'excel', xlsx: 'excel',
    ppt: 'powerpoint', pptx: 'powerpoint',
    zip: 'archive', tar: 'archive', gz: 'archive', '7z': 'archive',
    mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio',
    mp4: 'video', mov: 'video', avi: 'video', webm: 'video',
    txt: 'text', csv: 'text', md: 'text'
  };
  return `attachment-icon-${iconMap[ext] || 'generic'}`;
}

/**
 * Parse filename and optional caption from positional syntax:
 * [{ATTACH filename}] or [{ATTACH filename|Caption Text}]
 *
 * Used as fallback when no named src= param was provided.
 */
function parsePositional(originalMatch: string): { filename: string; caption: string | null } | null {
  // Strip [{ATTACH ...}] wrapper to get the inner content
  const inner = originalMatch.replace(/^\[\{ATTACH\s+/, '').replace(/\s*\}\]$/, '').trim();
  if (!inner || inner.includes('=')) {
    return null; // Named params — already handled by PluginSyntaxHandler
  }
  const parts = inner.split('|').map(p => p.trim());
  const filename = parts[0];
  const caption = parts[1] || null;
  return filename ? { filename, caption } : null;
}

const AttachPlugin: SimplePlugin = {
  name: 'ATTACH',
  description: 'Renders wiki attachments inline. Images display as clickable thumbnails; other files display as download links.',
  version: '1.0.0',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    try {
      const opts = params as AttachParams;

      // Resolve filename: named param (src=) takes precedence over positional syntax
      let filename = opts.src ? String(opts.src) : '';
      let caption = opts.caption ? String(opts.caption) : '';

      if (!filename) {
        // Fallback: parse [{ATTACH filename|caption}] positional form from originalMatch
        const rawMatch = typeof context.originalMatch === 'string' ? context.originalMatch : '';
        const positional = parsePositional(rawMatch);
        if (positional) {
          filename = positional.filename;
          if (!caption && positional.caption) caption = positional.caption;
        }
      }

      if (!filename) {
        return '<span class="error">ATTACH plugin: src is required</span>';
      }

      // Resolve attachment via AttachmentManager (canonical resolution shared with ImagePlugin)
      const attachmentManager = context.engine?.getManager('AttachmentManager') as AttachmentManager | undefined;
      const resolved = attachmentManager
        ? await attachmentManager.resolveAttachmentSrc(filename, context.pageName, context.userContext as ActorContext)
        : null;

      if (!resolved) {
        return `<span class="attachment-missing">[Attachment not found: ${escapeHtml(filename)}]</span>`;
      }

      const target = opts.target ? String(opts.target) : null;

      if (resolved.mimeType.startsWith('image/')) {
        // ── Image attachment ──────────────────────────────────────────────────
        // Use MIME type from metadata (not filename extension) for detection.
        // Delegate to shared image renderer — same output as ImagePlugin.
        const altText = escapeHtml(caption || filename);
        const escapedUrl = escapeHtml(resolved.url);

        return renderImageHtml({
          url: escapedUrl,
          alt: altText,
          caption: caption ? escapeHtml(caption) : undefined,
          width: opts.width,
          height: opts.height,
          align: opts.align ? String(opts.align) : null,
          display: opts.display ? String(opts.display) : undefined,
          style: opts.style ? String(opts.style) : undefined,
          cssClass: opts.class ? String(opts.class) : undefined,
          link: escapedUrl,
          linkTarget: target ?? undefined,
          linkClass: 'attach-image-link'
        });

      } else {
        // ── File attachment ───────────────────────────────────────────────────
        const linkText = escapeHtml(caption || filename);
        const targetAttr = target ? ` target="${escapeHtml(target)}"` : ' target="_blank"';
        const iconClass = getFileIconClass(filename);
        const extraClass = opts.class ? ` ${escapeHtml(String(opts.class))}` : '';
        const styleAttr = opts.style ? ` style="${escapeHtml(String(opts.style))}"` : '';

        return `<a href="${escapeHtml(resolved.url)}"${targetAttr} class="attachment-link${extraClass}"${styleAttr}><span class="attachment-icon ${iconClass}" aria-hidden="true"></span>${linkText}</a>`;
      }

    } catch {
      return '<span class="error">ATTACH plugin error</span>';
    }
  }
};

export default AttachPlugin;
