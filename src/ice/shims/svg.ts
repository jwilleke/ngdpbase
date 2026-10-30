/**
 * svg shim (#2149): cleans an SVG before it is kept as a file. An SVG is a
 * document, not a picture: it can carry scripts, HTML inside
 * `<foreignObject>`, `on…` event handlers, script links and animations that
 * set a link. The file is parsed and rebuilt from an allow-list of SVG
 * elements and attributes, never patched with patterns: what the parser did
 * not take as an allowed element or attribute is not written back. The note
 * says what kind of thing was removed and how many, never the content.
 *
 * The parser is the one the site already uses for author HTML
 * (`src/rendering/htmlPolicy.ts`): sanitize-html on htmlparser2, here in XML
 * mode so names keep their case. This file only configures it for SVG.
 *
 * Defence in depth, not the boundary: an uploaded file is always served
 * sandboxed (`untrustedFileHeaders`, #1624), so nothing in it runs as the
 * site. Cleaning keeps a file that is downloaded, embedded elsewhere or
 * opened outside the site from carrying it.
 *
 * A vetting shim only (`clean`, no `read`): never picked for an import run.
 */

import sanitizeHtml from 'sanitize-html';
import type { IceShim, IceWarning } from '../types.js';

/** The SVG elements a picture keeps, by their canonical (case-sensitive) names. */
const SVG_ELEMENTS = [
  'svg', 'g', 'defs', 'symbol', 'use', 'switch', 'view', 'title', 'desc', 'style',
  'a', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'image',
  'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker',
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
  'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge',
  'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting',
  'feSpotLight', 'feTile', 'feTurbulence',
  'animate', 'animateMotion', 'animateTransform', 'set', 'mpath'
];
const ELEMENT_BY_LOWER = new Map(SVG_ELEMENTS.map(e => [e.toLowerCase(), e]));

/** Elements removed with everything inside them: their content is not a picture's. */
const DROPPED_WITH_CONTENT = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'noscript', 'handler', 'listener']);

/** SVG's animation elements: one that animates a link is a script link in waiting. */
const ANIMATIONS = new Set(['animate', 'animatemotion', 'animatetransform', 'set']);

/** The attributes a picture keeps, lower-case. */
const SVG_ATTRIBUTES = new Set([
  'xmlns', 'xmlns:xlink', 'xml:space', 'xml:lang', 'version', 'baseprofile', 'id', 'class', 'style', 'lang',
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'dx', 'dy', 'z',
  'width', 'height', 'viewbox', 'preserveaspectratio', 'd', 'points', 'pathlength', 'transform', 'rotate',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'color',
  'display', 'visibility', 'overflow', 'clip-path', 'clip-rule', 'clippathunits', 'mask', 'maskunits',
  'maskcontentunits', 'filter', 'filterunits', 'primitiveunits', 'marker-start', 'marker-mid', 'marker-end',
  'markerwidth', 'markerheight', 'markerunits', 'refx', 'refy', 'orient', 'offset', 'stop-color',
  'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'patternunits',
  'patterncontentunits', 'patterntransform', 'font-family', 'font-size', 'font-weight', 'font-style',
  'font-variant', 'font-stretch', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'baseline-shift',
  'letter-spacing', 'word-spacing', 'text-decoration', 'writing-mode', 'textlength', 'lengthadjust',
  'startoffset', 'method', 'spacing', 'side', 'href', 'xlink:href', 'xlink:title', 'target',
  'in', 'in2', 'result', 'stddeviation', 'mode', 'operator', 'k1', 'k2', 'k3', 'k4', 'values', 'type',
  'tablevalues', 'slope', 'intercept', 'amplitude', 'exponent', 'flood-color', 'flood-opacity',
  'lighting-color', 'basefrequency', 'numoctaves', 'seed', 'stitchtiles', 'scale', 'xchannelselector',
  'ychannelselector', 'radius', 'kernelmatrix', 'kernelunitlength', 'order', 'divisor', 'bias', 'targetx',
  'targety', 'edgemode', 'preservealpha', 'surfacescale', 'diffuseconstant', 'specularconstant',
  'specularexponent', 'azimuth', 'elevation', 'pointsatx', 'pointsaty', 'pointsatz', 'limitingconeangle',
  'attributename', 'attributetype', 'begin', 'dur', 'end', 'min', 'max', 'restart', 'repeatcount',
  'repeatdur', 'from', 'to', 'by', 'keytimes', 'keysplines', 'keypoints', 'calcmode', 'additive',
  'accumulate', 'path', 'mix-blend-mode', 'isolation', 'image-rendering', 'shape-rendering',
  'text-rendering', 'color-interpolation', 'color-interpolation-filters', 'vector-effect', 'paint-order',
  'requiredfeatures', 'requiredextensions', 'systemlanguage', 'media', 'enable-background'
]);

/** A value that runs script or opens a document, anywhere in it (a `values` list too), once entities, quotes and white space are taken out. */
const SCRIPT_VALUE = /(?:javascript|vbscript|livescript):|data:(?:text\/html|application\/(?:xhtml\+)?xml|image\/svg\+xml)/i;

/** A link a picture may keep: a fragment, a relative path, the web, or an embedded raster image. */
const SAFE_LINK = /^(?:#|[^:]*(?:[/?#]|$)|https?:|data:image\/(?:png|jpe?g|gif|webp)[;,])/i;

function normalised(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;|&newline;/gi, '')
    // eslint-disable-next-line no-control-regex -- white space and control characters a browser ignores inside a URL scheme
    .replace(/[\s\u0000-\u001f]+/g, '');
}

function localPart(name: string): string {
  const lower = name.toLowerCase();
  return lower.slice(lower.lastIndexOf(':') + 1);
}

interface Counts { scripts: number; foreign: number; elements: number; animations: number; handlers: number; links: number; attributes: number; declarations: number }

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function notes(c: Counts): IceWarning[] {
  const out: IceWarning[] = [];
  if (c.scripts) out.push({ kind: 'svg-script', detail: `removed ${plural(c.scripts, 'script element', 'script elements')}` });
  if (c.foreign) out.push({ kind: 'svg-foreign-object', detail: `removed ${plural(c.foreign, 'block', 'blocks')} of embedded content (foreignObject, iframe, object)` });
  if (c.handlers) out.push({ kind: 'svg-handler', detail: `removed ${plural(c.handlers, 'event handler', 'event handlers')} (on… attributes)` });
  if (c.links) out.push({ kind: 'svg-script-link', detail: `removed ${plural(c.links, 'script link', 'script links')} (javascript: and other unsafe links)` });
  if (c.animations) out.push({ kind: 'svg-link-animation', detail: `removed ${plural(c.animations, 'animation', 'animations')} that set a link` });
  if (c.declarations) out.push({ kind: 'svg-declaration', detail: `removed ${plural(c.declarations, 'document type or processing instruction', 'document types or processing instructions')}` });
  if (c.elements) out.push({ kind: 'svg-element', detail: `removed ${plural(c.elements, 'other element', 'other elements')} a picture does not use` });
  if (c.attributes) out.push({ kind: 'svg-attribute', detail: `removed ${plural(c.attributes, 'other attribute', 'other attributes')} a picture does not use` });
  return out;
}

/** The cleaned text and what was removed: the pure step behind the shim. */
export function cleanSvgText(text: string): { text: string; removed: IceWarning[] } {
  const c: Counts = { scripts: 0, foreign: 0, elements: 0, animations: 0, handlers: 0, links: 0, attributes: 0, declarations: 0 };
  // A DOCTYPE (its internal subset can define entities a browser expands) and
  // processing instructions other than the XML declaration (xml-stylesheet can
  // load a transform). The parser drops both; they are counted here.
  c.declarations = (text.match(/<!DOCTYPE/gi) ?? []).length + (text.match(/<\?(?!xml[\s?])/gi) ?? []).length;

  // The names, as written, of elements dropped with their content. The parser
  // reads this list after the transform below has added the element's name.
  const droppedWithContent: string[] = [];
  const out = sanitizeHtml(text, {
    parser: { xmlMode: true },
    allowedTags: SVG_ELEMENTS,
    // Attributes are held to the allow-list in transformTags below, where each removal is counted.
    allowedAttributes: false,
    allowedSchemes: ['http', 'https', 'data'],
    allowedSchemesAppliedToAttributes: ['href', 'xlink:href', 'src'],
    nonTextTags: droppedWithContent,
    disallowedTagsMode: 'discard',
    // `style` is a picture's CSS; in XML mode a tag inside it is parsed as an element, and held to this list.
    allowVulnerableTags: true,
    transformTags: {
      '*': (tagName: string, attribs: sanitizeHtml.Attributes) => {
        const local = localPart(tagName);
        const canonical = tagName.includes(':') && !tagName.toLowerCase().startsWith('svg:') ? undefined : ELEMENT_BY_LOWER.get(local);
        if (!canonical) {
          if (local === 'script') c.scripts++;
          else if (DROPPED_WITH_CONTENT.has(local)) c.foreign++;
          else c.elements++;
          // Not on the allow-list, so the parser drops it; these with everything inside them.
          if (DROPPED_WITH_CONTENT.has(local)) droppedWithContent.push(tagName);
          return { tagName, attribs: {} };
        }
        const target = Object.entries(attribs).find(([name]) => localPart(name) === 'attributename')?.[1];
        if (ANIMATIONS.has(local) && target !== undefined && localPart(target.trim()) === 'href') {
          // The parser drops an animation of a link itself (sanitize-html's own rule); counted here.
          c.animations++;
          return { tagName: canonical, attribs };
        }
        const kept: sanitizeHtml.Attributes = {};
        for (const [name, value] of Object.entries(attribs)) {
          const lower = name.toLowerCase();
          const clean = normalised(value ?? '');
          if (localPart(lower).startsWith('on')) c.handlers++;
          else if (SCRIPT_VALUE.test(clean)) c.links++;
          else if (!SVG_ATTRIBUTES.has(lower)) c.attributes++;
          else if (localPart(lower) === 'href' && !SAFE_LINK.test(clean)) c.links++;
          else kept[name] = value;
        }
        return { tagName: canonical, attribs: kept };
      }
    }
  });
  const removed = notes(c);
  return { text: removed.length > 0 ? out : text, removed };
}

export const svgShim: IceShim = {
  name: 'svg',
  label: 'SVG',
  direction: 'in',
  accepts: { extensions: ['.svg'], mediaTypes: ['image/svg+xml'] },
  produces: 'file',
  receivers: [],

  async clean(input) {
    const original = input.bytes ?? Buffer.from(input.text ?? '', 'utf8');
    const { text, removed } = cleanSvgText(original.toString('utf8'));
    return { bytes: removed.length > 0 ? Buffer.from(text, 'utf8') : original, removed };
  }
};
