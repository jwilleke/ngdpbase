/**
 * Image plugin for ngdpbase
 * Implements inline image functionality similar to JSPWiki's Image plugin
 *
 * Syntax: [{Image src='path/to/image.jpg' alt='description' width='200' height='150'}]
 *
 * Parameters:
 *   src (required) - Image source path or URL. For wiki attachments, prefer [{ATTACH}].
 *   alt (optional) - Alt text (defaults to caption if not provided)
 *   caption (optional) - Image caption (also used as alt if alt not provided)
 *   width (optional) - Image width
 *   height (optional) - Image height
 *   align (optional) - Horizontal alignment: left, right, center
 *   display (optional) - Display mode:
 *     - block (default): Image in its own block, no text wrapping
 *     - float: Allows text wrapping around image
 *     - inline: Image flows inline with text
 *     - full: Full-width image
 *   border (optional) - Border width in pixels
 *   style (optional) - Custom inline CSS styles
 *   class (optional) - Custom CSS class
 *   title (optional) - Title attribute (tooltip)
 *   link (optional) - URL to link the image to
 *
 * When to use:
 *   - For wiki attachments, prefer [{ATTACH}] — it auto-detects image vs file.
 *   - Use [{Image}] when you need captions, float/display control, or external URLs.
 *
 * See docs/user-guide/Content-Management.md for guidance on choosing between plugins.
 *
 * Examples:
 *   [{Image src='/path/image.jpg' caption='My Image'}]
 *   [{Image src='/path/image.jpg' align='left' display='float' caption='Floats with text'}]
 *   [{Image src='https://external.url/img.jpg' caption='External image'}]
 */

import type { ActorContext } from '../context/ActorContext.js';
import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { renderImageHtml } from './renderImage.js';

interface ConfigManager {
  getProperty(key: string, defaultValue: string): string;
}

interface AttachmentManager {
  resolveAttachmentSrc(src: string, pageName: string, ctx: ActorContext): Promise<{ url: string; mimeType: string } | null>;
}

interface ImageParams extends PluginParams {
  src?: string;
  alt?: string;
  caption?: string;
  width?: string | number;
  height?: string | number;
  align?: string;
  display?: string;
  border?: string | number;
  style?: string;
  class?: string;
  title?: string;
  link?: string;
}

const ImagePlugin: SimplePlugin = {
  name: 'Image',
  description: 'Renders an image with optional caption, alignment, and display mode control',

  /**
   * Execute the plugin
   * @param context - Rendering context
   * @param params - Plugin parameters object (parsed from syntax)
   * @returns HTML output
   */
  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    try {
      const opts = params as ImageParams;

      const configManager = context.engine?.getManager('ConfigurationManager') as ConfigManager | undefined;
      const defaultAlt =
        configManager?.getProperty('ngdpbase.features.images.default-alt', 'Uploaded image') || 'Uploaded image';
      const defaultClass =
        configManager?.getProperty('ngdpbase.features.images.default-class', 'wiki-image') || 'wiki-image';

      if (!opts.src) {
        return '<span class="error">Image plugin: src attribute is required</span>';
      }

      const rawSrc = String(opts.src);
      const attachmentManager = context.engine?.getManager('AttachmentManager') as AttachmentManager | undefined;
      const resolved = attachmentManager
        ? await attachmentManager.resolveAttachmentSrc(rawSrc, context.pageName, context.userContext as ActorContext)
        : null;
      const src = resolved?.url ?? rawSrc;

      const alt = opts.alt ? String(opts.alt) : opts.caption ? String(opts.caption) : defaultAlt;
      const cssClass = opts.class ? String(opts.class) : defaultClass;

      return renderImageHtml({
        url: src,
        alt,
        caption: opts.caption ? String(opts.caption) : undefined,
        width: opts.width,
        height: opts.height,
        align: opts.align ? String(opts.align) : null,
        display: opts.display ? String(opts.display) : undefined,
        border: opts.border,
        style: opts.style ? String(opts.style) : undefined,
        cssClass,
        title: opts.title ? String(opts.title) : undefined,
        link: opts.link ? String(opts.link) : undefined,
        linkTarget: opts.link ? '_blank' : undefined
      });
    } catch {
      return '<span class="error">Image plugin error</span>';
    }
  }
};

export default ImagePlugin;
