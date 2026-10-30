/**
 * Vetting (#2149): the engine reads a file's type from its bytes and has its
 * format's shim clean it before it is kept as a file. The SVG and CSV
 * cleaners, the choice of cleaner, a cleaner that fails, and the config
 * switch through ImportManager.vetFile.
 *
 * Sabotaged once each (then restored):
 * - `cleanerFor` matching by extension even when the bytes show a type: "an
 *   SVG named .csv is cleaned as an SVG" went red.
 * - the SVG cleaner's script-value check (anywhere in a value) removed: "a
 *   script value anywhere in an attribute" went red.
 * - the SVG cleaner no longer dropping script/foreignObject with their
 *   content: three tests went red.
 * - the SVG cleaner's link-animation branch removed: "an animation that sets
 *   a link" went red (on its count: sanitize-html drops such an animation by
 *   its own rule too, so the element stays out either way).
 * - the CSV cleaner reading a non-UTF-8 file as UTF-8: "a Latin-1 CSV keeps
 *   every byte" went red.
 * - the CSV cleaner's plain-number exception removed: "a negative number is
 *   data" went red.
 */
import { cleanSvgText, svgShim } from '../shims/svg';
import { cleanCsvText, csvShim } from '../shims/csv';
import { IceVetRefused, vetFile } from '../vet';
import ImportManager from '../../managers/ImportManager';
import type { ActorContext } from '../../context/ActorContext';
import type { IceShim, RegisteredShim } from '../types';

const registered = (shim: IceShim): RegisteredShim => ({ ...shim, id: `core.${shim.name}`, owner: 'core' });
const SHIMS = [registered(csvShim), registered(svgShim)];
const upload = (name: string, text: string, mediaType?: string) => ({ name, bytes: Buffer.from(text), ...(mediaType ? { mediaType } : {}) });
const CTX = { username: 'ed', roles: ['editor'], isAuthenticated: true } as unknown as ActorContext;

describe('the SVG cleaner (#2149): parsed and rebuilt from an allow-list', () => {
  /** Nothing in `text` that can run: no script element, no handler, no script link, no link animation. */
  const inert = (text: string) => {
    expect(text).not.toMatch(/<(?:[\w-]+:)?script|<(?:[\w-]+:)?foreignObject|\son\w+\s*=|javascript:|vbscript:|attributeName="(?:xlink:)?href"/i);
  };

  test('removes scripts, embedded HTML, handlers and script links, and says how many of each', () => {
    const { text, removed } = cleanSvgText([
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<script type="text/javascript"><![CDATA[alert(1)]]></script>',
      '<svg:script href="x.js"/>',
      '<foreignObject width="9"><body xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></body></foreignObject>',
      '<rect width="4" ONLOAD="a()" onclick=\'b()\'/>',
      '<a xlink:href="javascript:alert(1)"><text>hi</text></a>',
      '</svg>'
    ].join(''));
    expect(text).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4"></rect><a><text>hi</text></a></svg>');
    expect(removed.map((r) => [r.kind, r.detail])).toEqual([
      ['svg-script', 'removed 2 script elements'],
      ['svg-foreign-object', 'removed 1 block of embedded content (foreignObject, iframe, object)'],
      ['svg-handler', 'removed 2 event handlers (on… attributes)'],
      ['svg-script-link', 'removed 1 script link (javascript: and other unsafe links)']
    ]);
  });

  test('an animation that sets a link is removed, whatever it sets it to (review of PR #2156)', () => {
    const viaValues = cleanSvgText('<svg><a><animate attributeName="href" values="0;javascript:alert(1)"/><text>x</text></a></svg>');
    expect(viaValues.text).toBe('<svg><a><text>x</text></a></svg>');
    expect(viaValues.removed).toEqual([{ kind: 'svg-link-animation', detail: 'removed 1 animation that set a link' }]);
    const viaSet = cleanSvgText('<svg><a><set attributeName="xlink:href" to="javascript:alert(1)"/><text>y</text></a></svg>');
    expect(viaSet.text).toBe('<svg><a><text>y</text></a></svg>');
    expect(viaSet.removed.map((r) => r.kind)).toEqual(['svg-link-animation']);
  });

  test('a script value anywhere in an attribute is removed, a values list and entity-hidden schemes included', () => {
    const { text, removed } = cleanSvgText([
      '<svg>',
      '<animate attributeName="fill" values="red;&#106;avascript:alert(1)"/>',
      '<a href="&#106;ava&#x73;cript&colon;alert(1)">x</a>',
      '<a href=" java\tscript:1">y</a>',
      '<image href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;"/>',
      '</svg>'
    ].join(''));
    inert(text);
    expect(text).toBe('<svg><animate attributeName="fill"></animate><a>x</a><a>y</a><image></image></svg>');
    expect(removed).toEqual([{ kind: 'svg-script-link', detail: 'removed 4 script links (javascript: and other unsafe links)' }]);
  });

  test('a script split around another cannot reassemble: what is written back is what was parsed', () => {
    const { text, removed } = cleanSvgText('<svg><scr<script></script>ipt>alert(1)</script></svg>');
    inert(text);
    expect(text).not.toContain('<scr');
    expect(removed.length).toBeGreaterThan(0);
  });

  test('a script left open is removed to the end', () => {
    expect(cleanSvgText('<svg><circle r="1"/><script>alert(1)').text).toBe('<svg><circle r="1"></circle></svg>');
  });

  test('a document type, which can define entities, is removed and the entity left as text', () => {
    const { text, removed } = cleanSvgText('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "<script>alert(1)</script>">]><svg>&x;</svg>');
    inert(text);
    expect(text).toContain('<svg>&amp;x;</svg>');
    expect(removed.map((r) => r.kind)).toContain('svg-declaration');
  });

  test('links a picture keeps stay: fragments, relative paths, the web, embedded raster images', () => {
    const svg = '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><linearGradient id="g"><stop offset="0"/></linearGradient><use xlink:href="#g"/><image href="pic.png"/><image href="https://example.com/a.png"/><image href="data:image/png;base64,AAA"/></svg>';
    expect(cleanSvgText(svg)).toEqual({ text: svg, removed: [] });
  });

  test('an element or attribute not on the list is removed and counted', () => {
    const { text, removed } = cleanSvgText('<svg><iframe src="x"></iframe><inkscape:grid/><rect width="1" data-x="1" inkscape:label="a"/></svg>');
    expect(text).toBe('<svg><rect width="1"></rect></svg>');
    expect(removed.map((r) => r.kind)).toEqual(['svg-foreign-object', 'svg-element', 'svg-attribute']);
  });

  test('a clean SVG is unchanged, and its bytes are the very ones given', async () => {
    const bytes = Buffer.from('<svg><g class="onion"><title>online</title><path d="M0 0"/></g></svg>');
    const result = await svgShim.clean!({ kind: 'file', name: 'a.svg', bytes });
    expect(result.removed).toEqual([]);
    expect(result.bytes).toBe(bytes);
  });
});

describe('the CSV cleaner (#2149)', () => {
  test('HTML comes out of a cell; a formula cell gets a leading quote; only changed cells are rewritten', () => {
    const { text, html, formulas } = cleanCsvText('a,"b, quoted",c\r\n<i>x</i>,=SUM(A1:A2),@cmd\r\n+1,"""q""",<!-- c -->ok\r\n');
    expect(text).toBe('a,"b, quoted",c\r\n"x","\'=SUM(A1:A2)","\'@cmd"\r\n+1,"""q""","ok"\r\n');
    expect({ html, formulas }).toEqual({ html: 2, formulas: 2 });
  });

  test('a negative or signed number is data, not a formula', () => {
    expect(cleanCsvText('n\n-5\n+3.25\n-1,234.5\n-.5\n1e-3\n').formulas).toBe(0);
    expect(cleanCsvText('n\n-5+cmd\n').formulas).toBe(1);
  });

  test('a Latin-1 CSV keeps every byte it had outside the cells cleaned (not read as UTF-8)', async () => {
    // "café,=1" in Latin-1: é is the single byte 0xE9, not valid UTF-8.
    const bytes = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x2c, 0x3d, 0x31, 0x0a]);
    const result = await csvShim.clean!({ kind: 'file', name: 'x.csv', bytes });
    expect([...result.bytes]).toEqual([0x63, 0x61, 0x66, 0xe9, 0x2c, ...Buffer.from('"\'=1"'), 0x0a]);
  });

  test('a UTF-8 CSV keeps its byte-order mark and its accents; a UTF-16 one is cleaned in UTF-16', async () => {
    const utf8 = await csvShim.clean!({ kind: 'file', name: 'x.csv', bytes: Buffer.from('﻿café,=1\n', 'utf8') });
    expect(utf8.bytes.toString('utf8')).toBe('﻿café,"\'=1"\n');
    const utf16 = await csvShim.clean!({ kind: 'file', name: 'x.csv', bytes: Buffer.from('﻿café,=1\n', 'utf16le') });
    expect(utf16.bytes.toString('utf16le')).toBe('﻿café,"\'=1"\n');
  });

  test('a TSV is read with tabs', async () => {
    const result = await csvShim.clean!({ kind: 'file', name: 'x.tsv', bytes: Buffer.from('a\t=1+1\n') });
    expect(result.bytes.toString()).toBe('a\t"\'=1+1"\n');
  });

  test('a CSV with nothing to clean comes back as the same bytes', async () => {
    const bytes = Buffer.from('a,b\n1,2');
    const result = await csvShim.clean!({ kind: 'file', name: 'x.csv', bytes });
    expect(result).toEqual({ bytes, removed: [] });
  });
});

describe('vetFile: which shim cleans, by the bytes first (#2149, #1624)', () => {
  test('an SVG named .csv is cleaned as an SVG: the bytes decide, not the name', async () => {
    const vetted = await vetFile(SHIMS, upload('data.csv', '<svg><script>x</script></svg>', 'text/csv'));
    expect(vetted).toMatchObject({ mediaType: 'image/svg+xml', cleanedBy: 'core.svg' });
    expect(vetted.bytes.toString()).toBe('<svg></svg>');
  });

  test('a CSV, whose bytes show no type of their own, is chosen by its name', async () => {
    const vetted = await vetFile(SHIMS, upload('data.csv', 'a\n=1\n'));
    expect(vetted).toMatchObject({ mediaType: 'text/csv', cleanedBy: 'core.csv' });
  });

  test('a PNG named .svg is a PNG: no SVG cleaning, nothing removed', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const vetted = await vetFile(SHIMS, { name: 'x.svg', bytes: png, mediaType: 'image/svg+xml' });
    expect(vetted).toMatchObject({ mediaType: 'image/png', removed: [] });
    expect(vetted.bytes).toBe(png);
  });

  test('a format with no cleaner is kept as it came', async () => {
    const vetted = await vetFile(SHIMS, upload('notes.txt', '<b>not cleaned</b> =1', 'text/plain'));
    expect(vetted).toEqual({ name: 'notes.txt', bytes: expect.any(Buffer), mediaType: 'text/plain', removed: [] });
    expect(vetted.bytes.toString()).toBe('<b>not cleaned</b> =1');
  });

  test('a cleaner that fails refuses the file: what could not be checked is not kept', async () => {
    const broken = registered({ ...svgShim, clean: () => Promise.reject(new Error('parser fell over')) });
    await expect(vetFile([broken], upload('a.svg', '<svg/>'))).rejects.toBeInstanceOf(IceVetRefused);
    await expect(vetFile([broken], upload('a.svg', '<svg/>'))).rejects.toThrow(/could not be checked, so it was not kept: parser fell over/);
  });
});

describe('ImportManager.vetFile (#2149)', () => {
  async function engineWith(config: Record<string, unknown>) {
    const engine = {
      getManager: (name: string) => (name === 'ConfigurationManager'
        ? { getProperty: (key: string, fallback: unknown) => (key in config ? config[key] : fallback), getResolvedDataPath: (_k: string, f: string) => f }
        : null)
    };
    const im = new ImportManager(engine);
    await im.initialize();
    return im;
  }

  test('runs core\'s cleaners, and needs a context', async () => {
    const im = await engineWith({});
    const vetted = await im.vetFile(upload('a.svg', '<svg onload="x()"/>'), CTX);
    expect(vetted.removed.map((r) => r.kind)).toEqual(['svg-handler']);
    await expect(im.vetFile(upload('a.svg', '<svg/>'), null as unknown as ActorContext)).rejects.toThrow(/requires an ActorContext/);
  });

  test('a shim switched off in configuration cleans nothing (D6)', async () => {
    const im = await engineWith({ 'ngdpbase.import.shims.core.svg.enabled': false });
    const vetted = await im.vetFile(upload('a.svg', '<svg onload="x()"/>'), CTX);
    expect(vetted.removed).toEqual([]);
  });
});
