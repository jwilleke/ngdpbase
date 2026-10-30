/**
 * Vetting (#2149): the engine reads a file's type from its bytes and has its
 * format's shim clean it before it is kept as a file. The SVG and CSV
 * cleaners, the choice of cleaner, a cleaner that fails, and the config
 * switch through ImportManager.vetFile.
 *
 * Sabotaged once each (then restored):
 * - `cleanerFor` matching by extension even when the bytes show a type: "an
 *   SVG named .csv is cleaned as an SVG" went red.
 * - the SVG cleaner's entity decoding removed: "an entity-hidden javascript:
 *   link" went red.
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

describe('the SVG cleaner (#2149)', () => {
  test('removes scripts, embedded HTML, handlers and script links, and says how many of each', () => {
    const { text, removed } = cleanSvgText([
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<script type="text/javascript"><![CDATA[alert(1)]]></script>',
      '<svg:script href="x.js"/>',
      '<foreignObject width="9"><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></body></foreignObject>',
      '<rect width="4" ONLOAD="a()" onclick=\'b()\'/>',
      '<a xlink:href="javascript:alert(1)"><text>hi</text></a>',
      '</svg>'
    ].join(''));
    expect(text).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4"/><a><text>hi</text></a></svg>');
    expect(removed.map((r) => [r.kind, r.detail])).toEqual([
      ['svg-script', 'removed 2 script elements'],
      ['svg-foreign-object', 'removed 1 block of embedded HTML (foreignObject)'],
      ['svg-handler', 'removed 2 event handlers (on… attributes)'],
      ['svg-script-link', 'removed 1 script link (javascript:)']
    ]);
  });

  test('an entity-hidden javascript: link is still a script link', () => {
    const { text, removed } = cleanSvgText('<svg><a href="&#106;ava&#x73;cript&colon;alert(1)">x</a><a href=" java\tscript:1">y</a></svg>');
    expect(text).toBe('<svg><a>x</a><a>y</a></svg>');
    expect(removed).toEqual([{ kind: 'svg-script-link', detail: 'removed 2 script links (javascript:)' }]);
  });

  test('a script left open runs to the end and is removed to the end', () => {
    expect(cleanSvgText('<svg><circle r="1"/><script>alert(1)').text).toBe('<svg><circle r="1"/>');
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
