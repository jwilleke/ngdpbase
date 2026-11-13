/**
 * `core.csv-file` (#2174): a list of `record` items as one CSV file.
 */
import { exportShims } from '../export';
import type { ExportShimTools, IceItem, IceShim } from '../../types';
import ExportManager from '../../../managers/ExportManager';

const exportManager = new ExportManager({});
const shim = exportShims({
  renderDocument: async () => '',
  htmlToPdf: async () => Buffer.alloc(0),
  pdfAvailable: () => false,
  toCsv: (headers, rows) => exportManager.toCsv(headers, rows)
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

  test('an item without a record is refused', async () => {
    await expect(write([{ kind: 'record', name: 'x' }])).rejects.toThrow(/core\.csv-file/);
  });
});
