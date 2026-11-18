/**
 * `core.csv-file` (#2174): a list of `record` items as one CSV file.
 */
import { exportShims } from '../export';
import type { ExportShimTools, IceItem, IceShim } from '../../types';
import ExportManager from '../../../managers/ExportManager';

const exportManager = new ExportManager({});
const limits = { maxColumns: 1000, maxCells: 20_000_000 };
const shim = exportShims({
  renderDocument: async () => '',
  htmlToPdf: async () => Buffer.alloc(0),
  pdfAvailable: () => false,
  toCsv: (headers, rows) => exportManager.toCsv(headers, rows),
  csvLimits: () => limits
}).find(s => s.name === 'csv-file') as IceShim;

const record = (properties: Record<string, unknown>, name = 'ledger'): IceItem => ({ kind: 'record', name, data: { id: 'x', properties } });
const write = async (items: IceItem[]) => (await shim.write!(items, {} as ExportShimTools))[0];
const textOf = (file: IceItem) => file.bytes!.toString('utf8');

describe('core.csv-file', () => {
  test('accepts record items and makes a file', () => {
    expect(shim).toMatchObject({ direction: 'out', produces: 'file', accepts: { kinds: ['record'] }, label: 'CSV (.csv)' });
  });

  test('one CSV file: the header is every key in the order first seen, a missing cell is empty', async () => {
    const file = await write([record({ a: 1, b: 'x' }), record({ b: 'y', c: true })]);
    expect(file).toMatchObject({ kind: 'file', name: 'ledger.csv', mediaType: 'text/csv; charset=utf-8' });
    expect(textOf(file)).toBe('a,b,c\r\n1,x,\r\n,y,true\r\n');
  });

  test('RFC 4180 quoting: commas, quotes and line breaks', async () => {
    const file = await write([record({ memo: 'a, "b"\nc' })]);
    expect(textOf(file)).toBe('memo\r\n"a, ""b""\nc"\r\n');
  });

  test.each(['=1+1', '+1', '-1', '@x', '\tx', '\rx'])('a text cell starting %j cannot run as a formula', async (cell) => {
    const file = await write([record({ v: cell })]);
    expect(textOf(file).split('\r\n')[1].replace(/^"|"$/g, '')).toBe(`'${cell}`);
  });

  test('a header that would run as a formula is guarded too', async () => {
    const file = await write([record({ '=cmd': 'x' })]);
    expect(textOf(file).startsWith('\'=cmd\r\n')).toBe(true);
  });

  test('a number stays a number: a negative amount is not prefixed', async () => {
    expect(textOf(await write([record({ amount: -12550 })]))).toBe('amount\r\n-12550\r\n');
  });

  test('UTF-8 bytes', async () => {
    const file = await write([record({ name: 'Zoë — 日本' })]);
    expect(file.bytes!.equals(Buffer.from('name\r\nZoë — 日本\r\n', 'utf8'))).toBe(true);
  });

  test('the file is named after the list, with nothing a file system refuses', async () => {
    expect((await write([record({ a: 1 }, 'My/list: 2026')])).name).toBe('My-list- 2026.csv');
  });

  test('a record with an own __proto__ key is a column of its own; rows without it get an empty cell', async () => {
    const withProto = JSON.parse('{"__proto__": "p", "a": 1}') as Record<string, unknown>;
    const file = await write([record(withProto), record({ a: 2 })]);
    expect(textOf(file)).toBe('__proto__,a\r\np,1\r\n,2\r\n');
  });

  describe('limits on the table', () => {
    const wide = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, k) => [`k${k}`, 'x']));

    test('more distinct columns than the cap is refused in plain words, before the table is built', async () => {
      const spy = vi.spyOn(exportManager, 'toCsv');
      const items = Array.from({ length: 200 }, (_, i) => record(Object.fromEntries(Object.keys(wide(1500)).map(k => [`${k}-${i}`, 1]))));
      await expect(write(items)).rejects.toThrow(/too many columns/i);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    test('rows x columns is not held to a size limit (#2408)', async () => {
      const file = await write(Array.from({ length: 5000 }, () => record(wide(10))));
      expect(textOf(file).split('\r\n')).toHaveLength(5002);
    });

    test('a normal 200-row export is written', async () => {
      const file = await write(Array.from({ length: 200 }, (_, i) => record({ date: '2026-01-02', memo: `m${i}`, amount: i })));
      expect(textOf(file).split('\r\n')).toHaveLength(202);
    });
  });

  describe('the cell cap (#2410)', () => {
    afterEach(() => { limits.maxCells = 20_000_000; });

    test('rows x columns over csv-max-cells is refused in plain words, before the table is built', async () => {
      limits.maxCells = 40;
      const spy = vi.spyOn(exportManager, 'toCsv');
      // 10 rows, 5 distinct columns: 50 cells.
      const items = Array.from({ length: 10 }, (_, i) => record({ [`c${i % 5}`]: i }));
      await expect(write(items)).rejects.toThrow(/too big for a CSV file.*fewer records or fewer fields/i);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    test('the message has no issue number or docs path', async () => {
      limits.maxCells = 1;
      const refusal = await write([record({ a: 1 }), record({ b: 2 })]).catch((e: Error) => e.message);
      expect(refusal).not.toMatch(/#\d|docs\/|csv-max-cells/);
    });

    test('exactly csv-max-cells is written', async () => {
      limits.maxCells = 50;
      const items = Array.from({ length: 10 }, (_, i) => record({ [`c${i % 5}`]: i }));
      expect(textOf(await write(items)).split('\r\n')).toHaveLength(12);
    });
  });

  test('an item without a record is refused', async () => {
    await expect(write([{ kind: 'record', name: 'x' }])).rejects.toThrow(/core\.csv-file/);
  });
});
